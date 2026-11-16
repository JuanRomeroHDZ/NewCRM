from app.services.writeup_exporter import _render_writeup_labels_html, format_writeup_labels_plain


def test_alternative_code_fence_preserves_labels():
    source = '~~~~md\n{etiqueta:jade:normal:Texto}\n```\n~~~~\n\n{etiqueta:azul:normal:Fuera}'
    assert format_writeup_labels_plain(source).endswith('\n\nFuera')
    assert '{etiqueta:jade:normal:Texto}' in _render_writeup_labels_html(source)


def test_label_palette_escapes_html_and_preserves_legacy_anchors():
    source = '{#Respuesta} {etiqueta:rojo:grande:<script>}'
    rendered = _render_writeup_labels_html(source)
    assert '{#Respuesta}' in rendered
    assert 'writeup-label-rojo writeup-label-grande' in rendered
    assert '&lt;script&gt;' in rendered and '<script>' not in rendered
    assert format_writeup_labels_plain(source) == '{#Respuesta} <script>'


def test_labels_in_code_and_invalid_colors_are_not_interpreted():
    source = '`{etiqueta:jade:normal:Ejemplo}`\n```\n{etiqueta:rojo:normal:Ejemplo}\n```\n{etiqueta:evil:normal:Ejemplo}'
    assert _render_writeup_labels_html(source) == source
    assert format_writeup_labels_plain(source) == source
