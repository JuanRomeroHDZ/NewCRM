# Dependencias del equipo anfitrión para la instalación inicial.

detect_host() {
  local ID=linux ID_LIKE= PRETTY_NAME=Linux VERSION_CODENAME= UBUNTU_CODENAME= debian_version=
  if [[ -r /etc/os-release ]]; then
    . /etc/os-release
  elif [[ -r /usr/lib/os-release ]]; then
    . /usr/lib/os-release
  fi
  HOST_OS_NAME="$PRETTY_NAME"
  HOST_DOCKER_FAMILY=
  HOST_DOCKER_SUITE=
  case " $ID $ID_LIKE " in
    *' ubuntu '*)
      HOST_DOCKER_FAMILY=ubuntu
      HOST_DOCKER_SUITE="${UBUNTU_CODENAME:-$VERSION_CODENAME}"
      ;;
    *' debian '*|*' parrot '*)
      HOST_DOCKER_FAMILY=debian
      if [[ "$ID" == debian ]]; then
        HOST_DOCKER_SUITE="$VERSION_CODENAME"
      elif [[ -r /etc/debian_version ]]; then
        read -r debian_version < /etc/debian_version || true
        case "${debian_version%%.*}" in
          12) HOST_DOCKER_SUITE=bookworm ;;
          13) HOST_DOCKER_SUITE=trixie ;;
        esac
      fi
      ;;
    *' fedora '*) HOST_DOCKER_FAMILY=fedora ;;
    *' rhel '*) HOST_DOCKER_FAMILY=rhel ;;
    *' centos '*) HOST_DOCKER_FAMILY=centos ;;
  esac
}

print_docker_install_help() {
  detect_host
  if [[ -n "$HOST_DOCKER_FAMILY" ]]; then
    printf 'Docker Engine y sus complementos para %s: https://docs.docker.com/engine/install/%s/\n' \
      "$HOST_OS_NAME" "$HOST_DOCKER_FAMILY" >&2
    if [[ "$HOST_DOCKER_FAMILY" == debian && -n "$HOST_DOCKER_SUITE" ]]; then
      printf 'Base para el repositorio de Docker: %s.\n' "$HOST_DOCKER_SUITE" >&2
    fi
  else
    echo 'Consulta la instalación de Docker para tu distribución: https://docs.docker.com/engine/install/' >&2
  fi
}

apt_candidate() {
  LC_ALL=C apt-cache policy "$1" | awk '$1 == "Candidate:" && $2 != "(none)" && !found { print $2; found = 1 }'
}

apt_installed() {
  [[ "$(dpkg-query -W -f='${Status}' "$1" 2>/dev/null)" == 'install ok installed' ]]
}

add_docker_apt_source() (
  local key repository="https://download.docker.com/linux/$HOST_DOCKER_FAMILY"
  local directory=/etc/apt/keyrings sources=/etc/apt/sources.list.d/lessso-docker.sources
  if [[ ! "$HOST_DOCKER_SUITE" =~ ^[a-z][a-z0-9-]+$ ]] ||
     [[ -e "$sources" || -L "$sources" ]] ||
     grep -rsq 'download\.docker\.com/linux/' /etc/apt/sources.list /etc/apt/sources.list.d; then
    echo 'APT requiere revisar el repositorio de Docker para esta distribución.' >&2
    exit 1
  fi

  key="$(mktemp)" || exit 1
  trap 'rm -f -- "$key"' EXIT
  if ! curl -fsSL --max-time 30 "$repository/dists/$HOST_DOCKER_SUITE/InRelease" -o /dev/null; then
    printf 'Docker no publica un repositorio accesible para %s.\n' "$HOST_DOCKER_SUITE" >&2
    exit 1
  fi
  curl -fsSL --max-time 30 "$repository/gpg" -o "$key" || exit 1
  sudo install -m 0755 -d "$directory" &&
    sudo install -m 0644 "$key" "$directory/lessso-docker.asc" || exit 1
  printf 'Types: deb\nURIs: %s\nSuites: %s\nComponents: stable\nArchitectures: %s\nSigned-By: %s/lessso-docker.asc\n' \
    "$repository" "$HOST_DOCKER_SUITE" "$(dpkg --print-architecture)" "$directory" |
    sudo tee "$sources" >/dev/null
)

prepare_host_dependencies() {
  local dependency answer compose_version compose_package=
  local -a packages=() docker_packages=()
  local needs_engine=false needs_compose=false needs_buildx=false official_packages=false
  detect_host
  printf '\nSistema detectado: %s (%s)\n' "$HOST_OS_NAME" "$(uname -m)"

  for dependency in python3 openssl; do
    command -v "$dependency" >/dev/null 2>&1 || packages+=("$dependency")
  done
  command -v flock >/dev/null 2>&1 || packages+=(util-linux)
  command -v docker >/dev/null 2>&1 || needs_engine=true
  docker compose version >/dev/null 2>&1 || needs_compose=true
  docker buildx version >/dev/null 2>&1 || needs_buildx=true
  if (( ${#packages[@]} == 0 )) && ! $needs_engine && ! $needs_compose && ! $needs_buildx; then
    return 0
  fi

  if [[ "$HOST_DOCKER_FAMILY" != debian && "$HOST_DOCKER_FAMILY" != ubuntu ]] ||
     ! command -v apt-get >/dev/null || ! command -v sudo >/dev/null; then
    echo 'Instala Python 3, OpenSSL, util-linux y Docker Engine con Compose y Buildx en el sistema detectado.' >&2
    print_docker_install_help
    return 1
  fi
  echo 'Faltan dependencias. Se consultarán los repositorios APT para instalar los paquetes correspondientes.'
  read -r -p '¿Continuar con sudo? [s/N]: ' answer || return 1
  [[ "$answer" == [sS] ]] || return 1
  if ! sudo apt-get update; then
    print_docker_install_help
    return 1
  fi

  if $needs_engine || $needs_compose || $needs_buildx; then
    # Debian y Parrot pueden publicar Compose v1 o v2 con el mismo nombre.
    compose_version="$(apt_candidate docker-compose)"
    if [[ -n "$(apt_candidate docker-compose-v2)" ]]; then
      compose_package=docker-compose-v2
    elif [[ -n "$compose_version" ]] && dpkg --compare-versions "${compose_version##*:}" ge '2~'; then
      compose_package=docker-compose
    fi

    if apt_installed docker-ce-cli; then
      official_packages=true
    elif $needs_engine && ! apt_installed docker.io; then
      if [[ -z "$compose_package" || -z "$(apt_candidate docker-buildx)" || -z "$(apt_candidate docker.io)" ]]; then
        official_packages=true
      fi
    fi
    if $official_packages; then
      compose_package=docker-compose-plugin
      if $needs_engine && [[ -z "$(apt_candidate docker-ce)" ]]; then
        printf 'Docker requiere un repositorio adicional para la base %s.\n' "${HOST_DOCKER_SUITE:-desconocida}"
        read -r -p '¿Añadir el repositorio firmado de Docker? [s/N]: ' answer || return 1
        [[ "$answer" == [sS] ]] || return 1
        if ! sudo apt-get install --no-remove ca-certificates curl ||
           ! add_docker_apt_source || ! sudo apt-get update; then
          print_docker_install_help
          return 1
        fi
      fi
      if $needs_engine; then docker_packages+=(docker-ce docker-ce-cli containerd.io); fi
      if $needs_buildx; then docker_packages+=(docker-buildx-plugin); fi
    elif $needs_engine || apt_installed docker.io; then
      if $needs_engine; then docker_packages+=(docker.io); fi
      if $needs_buildx; then docker_packages+=(docker-buildx); fi
    else
      echo 'Completa Compose y Buildx con el mismo proveedor de tu Docker actual.' >&2
      print_docker_install_help
      return 1
    fi
    if $needs_compose; then
      if [[ -z "$compose_package" ]]; then
        echo 'APT solo ofrece Compose antiguo o no tiene un candidato para este Docker.' >&2
        print_docker_install_help
        return 1
      fi
      docker_packages+=("$compose_package")
    fi
  fi

  packages+=("${docker_packages[@]}")
  for dependency in "${packages[@]}"; do
    if [[ -z "$(apt_candidate "$dependency")" ]]; then
      printf 'APT no encuentra el paquete %s para %s.\n' "$dependency" "$HOST_OS_NAME" >&2
      print_docker_install_help
      return 1
    fi
  done
  sudo apt-get install --no-remove "${packages[@]}"
}
