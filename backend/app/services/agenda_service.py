from datetime import datetime, timezone, timedelta, time
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.agenda import AgendaEvent, OperationTask, ClientAsset, PentestEngagement, PentestFinding
from app.models.core import ActivityEvent
from app.services.config_service import DEFAULT_CATALOGS, get_config_parameter

def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

class AgendaService:
    @staticmethod
    async def detect_overlaps(
        session: AsyncSession,
        start_time: datetime,
        end_time: datetime,
        exclude_event_id: str | None = None
    ) -> list[AgendaEvent]:
        stmt = select(AgendaEvent).where(
            AgendaEvent.status != "cancelado",
            AgendaEvent.start_time < end_time,
            AgendaEvent.end_time > start_time
        )
        if exclude_event_id:
            stmt = stmt.where(AgendaEvent.id != exclude_event_id)

        res = await session.execute(stmt)
        return list(res.scalars().all())

    @staticmethod
    async def create_event(
        session: AsyncSession,
        user_id: str,
        event_type: str,
        title: str,
        start_time: datetime,
        end_time: datetime,
        description: str | None = None,
        location: str | None = None,
        client_id: str | None = None,
        prospect_id: str | None = None,
        sale_id: str | None = None,
        recurrence_interval_days: int | None = None
    ) -> tuple[AgendaEvent, list[AgendaEvent]]:
        if end_time <= start_time:
            raise ValueError("La hora de término debe ser posterior a la de inicio.")

        overlaps = await AgendaService.detect_overlaps(session, start_time, end_time)
        is_financial = (event_type == "finanzas")

        event = AgendaEvent(
            event_type=event_type,
            title=title,
            description=description,
            location=location,
            start_time=start_time,
            end_time=end_time,
            client_id=client_id,
            prospect_id=prospect_id,
            sale_id=sale_id,
            is_financial=is_financial,
            recurrence_interval_days=recurrence_interval_days,
            status="programado"
        )
        session.add(event)
        await session.flush()

        audit = ActivityEvent(
            module="agenda",
            action="create",
            entity_type="agenda_event",
            entity_id=event.id,
            user_id=user_id,
            summary=f"Evento creado: {title} ({event_type}) el {start_time.strftime('%Y-%m-%d %H:%M')}"
        )
        session.add(audit)

        await session.commit()
        await session.refresh(event)
        return event, overlaps

    @staticmethod
    async def complete_event(session: AsyncSession, event_id: str, user_id: str) -> tuple[AgendaEvent, AgendaEvent | None]:
        """
        Marks event as completed. If recurrence is configured (e.g. maintenance),
        automatically creates the next scheduled event without manual intervention.
        """
        event = await session.get(AgendaEvent, event_id)
        if not event:
            raise ValueError("Evento no encontrado.")

        event.status = "completado"
        next_event = None

        if event.recurrence_interval_days and event.recurrence_interval_days > 0 and not event.next_event_id:
            next_start = event.start_time + timedelta(days=event.recurrence_interval_days)
            duration = event.end_time - event.start_time
            next_end = next_start + duration

            next_event = AgendaEvent(
                event_type=event.event_type,
                title=f"{event.title} (Recurrente)",
                description=event.description,
                location=event.location,
                start_time=next_start,
                end_time=next_end,
                client_id=event.client_id,
                prospect_id=event.prospect_id,
                sale_id=event.sale_id,
                is_financial=event.is_financial,
                recurrence_interval_days=event.recurrence_interval_days,
                status="programado"
            )
            session.add(next_event)
            await session.flush()
            event.next_event_id = next_event.id

        audit = ActivityEvent(
            module="agenda",
            action="update",
            entity_type="agenda_event",
            entity_id=event.id,
            user_id=user_id,
            summary=f"Evento completado: {event.title}" + (f" -> Siguiente programado para {next_event.start_time.strftime('%Y-%m-%d')}" if next_event else "")
        )
        session.add(audit)

        await session.commit()
        await session.refresh(event)
        if next_event:
            await session.refresh(next_event)
        return event, next_event

    @staticmethod
    async def calculate_availability(
        session: AsyncSession,
        target_date: str,  # YYYY-MM-DD
        duration_minutes: int = 60,
        buffer_minutes: int = 15,
        work_start_hour: int | None = None,
        work_end_hour: int | None = None
    ) -> dict:
        """
        Calculates open slots factoring in work hours, buffer times, holidays catalog,
        and existing events. Generates copiable formatted proposal text.
        """
        if duration_minutes < 15 or duration_minutes > 480:
            raise ValueError("La duración de la cita debe estar entre 15 y 480 minutos.")
        if buffer_minutes < 0 or buffer_minutes > 120:
            raise ValueError("El tiempo de holgura debe estar entre 0 y 120 minutos.")

        start_hour = settings.AGENDA_WORK_START_HOUR if work_start_hour is None else work_start_hour
        end_hour = settings.AGENDA_WORK_END_HOUR if work_end_hour is None else work_end_hour
        if not (0 <= start_hour < end_hour <= 24):
            raise ValueError("El horario laboral configurado es inválido.")

        day_date = datetime.strptime(target_date, "%Y-%m-%d").date()
        holidays_catalog = await get_config_parameter(session, "mexico_holidays", DEFAULT_CATALOGS.get("mexico_holidays", []))
        holiday_name = None
        if isinstance(holidays_catalog, list):
            mm_dd = day_date.strftime("%m-%d")
            for item in holidays_catalog:
                if not isinstance(item, dict):
                    continue
                h_date = str(item.get("date") or "")
                if h_date == target_date or (len(h_date) == 10 and h_date[5:] == mm_dd) or h_date == mm_dd:
                    holiday_name = item.get("name")
                    break

        day_start = datetime.combine(day_date, time(start_hour, 0))
        day_end = datetime.combine(day_date, time(end_hour, 0))

        # Query existing events for the day
        stmt = select(AgendaEvent).where(
            AgendaEvent.status != "cancelado",
            AgendaEvent.start_time < day_end,
            AgendaEvent.end_time > day_start
        ).order_by(AgendaEvent.start_time.asc())
        res = await session.execute(stmt)
        existing = list(res.scalars().all())

        free_slots = []
        cursor = day_start
        delta_duration = timedelta(minutes=duration_minutes)
        delta_buffer = timedelta(minutes=buffer_minutes)

        while cursor + delta_duration <= day_end:
            slot_end = cursor + delta_duration
            # Check overlap with existing events
            has_conflict = any(ev.start_time < slot_end and ev.end_time > cursor for ev in existing)
            if not has_conflict:
                free_slots.append({
                    "start": cursor.strftime("%H:%M"),
                    "end": slot_end.strftime("%H:%M")
                })
                cursor = slot_end + delta_buffer
            else:
                cursor += timedelta(minutes=30)

        # Copiable text in Spanish
        day_names_es = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
        weekday_name = day_names_es[day_date.weekday()]
        copiable_lines = [f"Hola, con gusto nos reunimos el {weekday_name} {target_date}."]
        if holiday_name:
            copiable_lines.append(f"(Nota: Día feriado oficial en México - {holiday_name})")
        if free_slots:
            copiable_lines.append("Tengo disponibles los siguientes horarios:")
            for s in free_slots[:5]:
                copiable_lines.append(f"- {s['start']} a {s['end']}")
            copiable_lines.append("¿Cuál de estos te acomoda mejor?")
        else:
            copiable_lines.append("No cuento con espacios disponibles en ese día. ¿Te funcionaría revisar el día siguiente?")

        return {
            "date": target_date,
            "holiday": holiday_name,
            "available_slots": free_slots,
            "copiable_proposal_text": "\n".join(copiable_lines)
        }

    @staticmethod
    async def record_pentest_finding(
        session: AsyncSession,
        engagement_id: str,
        title: str,
        severity: str,
        description: str,
        remediation: str,
        user_id: str,
        cvss_score: float | None = None
    ) -> PentestFinding:
        """
        Records a pentesting finding. Enforces strict window start/end times.
        Rejects recording if current time is outside the authorized testing window.
        """
        engagement = await session.get(PentestEngagement, engagement_id)
        if not engagement:
            raise ValueError("Evaluación de pentesting no encontrada.")

        now = utc_now()
        if now < engagement.window_start or now > engagement.window_end:
            raise ValueError(
                f"No se permiten registros o pruebas fuera de la ventana autorizada de pentesting. "
                f"Ventana autorizada: {engagement.window_start.strftime('%Y-%m-%d %H:%M')} a {engagement.window_end.strftime('%Y-%m-%d %H:%M')}. "
                f"Hora actual del servidor: {now.strftime('%Y-%m-%d %H:%M')}."
            )

        finding = PentestFinding(
            engagement_id=engagement.id,
            title=title,
            severity=severity,
            cvss_score=cvss_score,
            description=description,
            remediation=remediation,
            recorded_at=now,
            status="abierta"
        )
        session.add(finding)

        audit = ActivityEvent(
            module="agenda",
            action="create",
            entity_type="pentest_finding",
            entity_id=finding.id,
            user_id=user_id,
            summary=f"Hallazgo de pentesting registrado: {title} ({severity.upper()})"
        )
        session.add(audit)

        await session.commit()
        await session.refresh(finding)
        return finding

    @staticmethod
    async def export_events_to_ics(session: AsyncSession, include_financial: bool = False) -> str:
        """
        Generates RFC 5545 iCalendar content. Financial events are strictly excluded
        by default per Section 14 privacy policies.
        """
        stmt = select(AgendaEvent).where(AgendaEvent.status != "cancelado")
        if not include_financial:
            stmt = stmt.where(AgendaEvent.is_financial == False)

        res = await session.execute(stmt)
        events = res.scalars().all()

        lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Contact LESSSO//Agenda Modular//ES",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH"
        ]

        for ev in events:
            dt_start = ev.start_time.strftime("%Y%m%dT%H%M%SZ")
            dt_end = ev.end_time.strftime("%Y%m%dT%H%M%SZ")
            lines.extend([
                "BEGIN:VEVENT",
                f"UID:{ev.id}@{settings.SERVER_NAME}",
                f"DTSTAMP:{utc_now().strftime('%Y%m%dT%H%M%SZ')}",
                f"DTSTART:{dt_start}",
                f"DTEND:{dt_end}",
                f"SUMMARY:{ev.title}",
                f"DESCRIPTION:{ev.description or ''}",
                f"LOCATION:{ev.location or ''}",
                f"STATUS:{'CONFIRMED' if ev.status == 'programado' else 'CANCELLED'}",
                "END:VEVENT"
            ])

        lines.append("END:VCALENDAR")
        return "\r\n".join(lines)

    @staticmethod
    def get_google_calendar_status():
        return {
            "enabled": False,
            "status": "inactivo",
            "account": None,
            "message": "Adaptador de Google Calendar inactivo por defecto. Se cuenta con respaldo completo en archivos .ics."
        }
