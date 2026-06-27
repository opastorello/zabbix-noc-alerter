<h1 align="center">🔔 Zabbix NOC Alerter</h1>

<p align="center">
  Una <b>alarma sonora y notificación</b> del navegador en el momento en que aparece<br>
  un <b>problema nuevo</b> en Zabbix, usando la sesión donde ya <b>tienes login</b>. Sin token, nada fijo en código.
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.pt.md">Português</a> ·
  <b>Español</b>
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/zabbix-noc-alerter/nlbihmhpbdfhnglclecbaebnfpjbngep"><img alt="Chrome Web Store" src="https://img.shields.io/chrome-web-store/v/nlbihmhpbdfhnglclecbaebnfpjbngep?label=Chrome%20Web%20Store&color=e45959&logo=googlechrome&logoColor=white"></a>
  <a href="https://github.com/opastorello/zabbix-noc-alerter/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/opastorello/zabbix-noc-alerter/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="chrome" src="https://img.shields.io/badge/Chrome-MV3-e45959">
  <img alt="zabbix" src="https://img.shields.io/badge/Zabbix-6.x%20%7C%207.x-red">
  <img alt="i18n" src="https://img.shields.io/badge/i18n-EN%20%7C%20PT%20%7C%20ES-9aa3b2">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-green">
</p>

<p align="center">
  <img src="assets/es/screenshot-1.jpeg" alt="Popup con los problemas activos de Zabbix" width="820">
</p>

Un panel que tienes que estar mirando es fácil de perder. Esta extensión convierte
un problema nuevo de Zabbix en algo imposible de ignorar: un sonido y una
notificación, en tu navegador, mientras trabajas en cualquier otra cosa.

## Funciones

- 🔊 **Sonido por severidad** con volumen y botón de prueba.
- 🔁 **Re-alarma** (sonido y notificación) mientras haya un problema no reconocido, hasta dar ack o silencio.
- 🛠️ **Consciente de mantenimiento:** los problemas en ventana de mantenimiento reciben la etiqueta MNT y quedan en silencio (o los ocultas).
- 🔍 **Filtro en vivo** en el popup por host o nombre del problema.
- 🖥️ **Muestra el host** en la lista y en la notificación.
- ✅ **Ack desde el popup** (con mensaje) y muestra el ack existente.
- 🟢 **Notificación de resuelto** cuando un problema se recupera.
- 🖱️ **Clic en el problema** abre el evento exacto en Zabbix.
- 🔎 **Filtros:** severidad mínima, edad máxima, excluir por texto, ocultar suprimidos/reconocidos/en mantenimiento; badge "no vistos" opcional.
- 🌐 **Idiomas:** English, Português, Español, elegido automáticamente por el navegador.
- 🔒 **Nada fijo en código:** la URL de Zabbix (y un token opcional) viven solo en las opciones.

## Instalación

### Desde la Chrome Web Store (recomendado)

[**Instalar Zabbix NOC Alerter**](https://chromewebstore.google.com/detail/zabbix-noc-alerter/nlbihmhpbdfhnglclecbaebnfpjbngep) - un clic, con actualizaciones automáticas. Luego abre las **opciones** de la extensión, pon la URL de tu Zabbix y mantén una pestaña de Zabbix con sesión iniciada. Eso es todo.

### Desde el código (unpacked)

1. Descarga el [release](https://github.com/opastorello/zabbix-noc-alerter/releases/latest) más reciente y descomprímelo (o clona este repositorio).
2. Abre `chrome://extensions`, activa el **Developer mode**, pulsa **Load unpacked** y elige la carpeta.
3. Abre las **opciones** de la extensión y pon la URL de tu Zabbix.
4. Mantén una pestaña de Zabbix con sesión iniciada. Eso es todo.

## Cómo funciona

La extensión lee la cookie de sesión de la pestaña de Zabbix donde ya tienes login
y consulta la API por problemas activos. Un problema nuevo reproduce un sonido y
lanza una notificación. No hace falta token; si tu versión no acepta la sesión del
frontend para escritura (ack), define un token de API en las opciones como respaldo.

**Compatibilidad:** probado en Zabbix 6.0 a 7.4 (la sesión del frontend y todas las llamadas a la API funcionan). Zabbix 8.0 se validará cuando llegue a una versión estable.

## Privacidad

Habla solo con **tu Zabbix** (la URL que configuraste) y lee la cookie de sesión
localmente. Sin analytics, sin telemetría, sin URL o token incrustados en el código.

## Capturas de pantalla

<p align="center">
  <img src="assets/es/screenshot-2.jpeg" alt="Notificaciones del navegador" width="820">
  <br><br>
  <img src="assets/es/screenshot-3.jpeg" alt="Opciones y filtros" width="820">
  <br><br>
  <img src="assets/es/screenshot-4.jpeg" alt="Privada por diseño" width="820">
</p>

## Contribuir

Issues y pull requests son bienvenidos, en especial nuevas traducciones. Mira
[CONTRIBUTING.md](CONTRIBUTING.md).

## Licencia

[MIT](LICENSE) © Nicolas Pastorello ([@opastorello](https://github.com/opastorello))
