<h1 align="center">🔔 Zabbix NOC Alerter</h1>

<p align="center">
  Um <b>alarme sonoro e notificação</b> do navegador no instante em que um <b>problema novo</b><br>
  aparece no Zabbix, usando a sessão em que você <b>já está logado</b>. Sem token, nada hardcoded.
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <b>Português</b> ·
  <a href="README.es.md">Español</a>
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
  <img src="assets/pt/screenshot-1.jpeg" alt="Popup com os problemas ativos do Zabbix" width="820">
</p>

Um painel que você precisa ficar olhando é fácil de perder de vista. Esta extensão
transforma um problema novo do Zabbix em algo impossível de ignorar: um som e uma
notificação, direto no navegador, enquanto você trabalha em qualquer outra coisa.

## Recursos

- 🛰️ **Multi-instância:** monitore até 8 servidores Zabbix independentes ao mesmo tempo, cada um com sua URL e autenticação; cada problema mostra um badge da instância.
- 🔑 **Três modos de autenticação por instância:** sessão do navegador (sem credencial), token de API, ou usuário e senha (a extensão faz o login e renova a sessão sozinha).
- 🔊 **Som por severidade** com volume e botão de teste.
- 🔁 **Re-alarme** (som e notificação) enquanto houver problema não reconhecido, até dar ack ou mudo.
- 📅 **Alertar só no horário de trabalho:** lê o Working time do seu servidor Zabbix e fica em silêncio fora dele (lista e badge continuam atualizando).
- 🎦 **Modo reunião (Google Meet):** silencia sons e/ou notificações enquanto você está numa call do Meet.
- 🛠️ **Ciente de manutenção:** problemas em janela de manutenção ganham a tag MNT e ficam silenciosos (ou você esconde).
- 🔍 **Filtro ao vivo** no popup por host ou nome do problema, ou clicando numa severidade; **ordenar** e **agrupar por host ou instância**.
- 💤 **Adiar (snooze) um problema só** (15 min a 4 h) sem o mudo global; ao acabar, ele re-alerta.
- 🖥️ **Mostra o host** (e a instância, quando você monitora mais de uma) na lista e na notificação.
- ✅ **Ack direto do popup** (com mensagem) e mostra o ack existente.
- 🟢 **Notificação de resolvido** quando um problema recupera.
- 🖱️ **Clique no problema** abre o evento exato no Zabbix.
- 🔎 **Filtros:** severidade mínima, idade máxima, **host groups**, excluir por texto, esconder suprimidos/ackados/em manutenção; badge "não vistos" opcional.
- 💾 **Backup:** exportar e importar configurações em JSON (tokens e senhas das instâncias nunca são exportados).
- 🌐 **Idiomas:** English, Português, Español, escolhido automaticamente pelo navegador.
- 🔒 **Nada hardcoded:** as URLs do Zabbix (e as credenciais) ficam só nas opções.

## Instalação

### Pela Chrome Web Store (recomendado)

[**Instalar o Zabbix NOC Alerter**](https://chromewebstore.google.com/detail/zabbix-noc-alerter/nlbihmhpbdfhnglclecbaebnfpjbngep) - um clique, com atualizações automáticas. Depois abra as **opções** da extensão, adicione uma instância do Zabbix e mantenha uma aba do Zabbix logada. É só isso.

### A partir do código (unpacked)

1. Baixe o [release](https://github.com/opastorello/zabbix-noc-alerter/releases/latest) mais recente e descompacte (ou clone este repositório).
2. Abra `chrome://extensions`, ligue o **Developer mode**, clique em **Load unpacked** e selecione a pasta.
3. Abra as **opções** da extensão e adicione uma instância do Zabbix (URL e a forma de autenticação).
4. Se escolheu o modo sessão do navegador, mantenha uma aba do Zabbix logada. É só isso.

## Como funciona

A extensão consulta a API do Zabbix por problemas ativos; um problema novo toca um
som e sobe uma notificação. Cada instância autentica de uma de três formas,
escolhida nas opções:

- **Sem autenticação (sessão do navegador):** lê o cookie de sessão da aba do Zabbix em que você já está logado. Nada para configurar; basta manter uma aba logada.
- **Token de API:** um token gerado no Zabbix (Usuário > Tokens de API). Funciona sem aba do Zabbix aberta e sobrevive ao logout do frontend.
- **Usuário e senha:** a extensão faz login na API (`user.login`) e renova a sessão sozinha quando ela expira.

**Compatibilidade:** testado no Zabbix 6.0 a 7.4 (a sessão do frontend e todas as chamadas de API funcionam). O Zabbix 8.0 será validado quando sair em versão estável.

## Privacidade

Só fala com **o seu Zabbix** (a URL que você configurou) e lê o cookie de sessão
localmente. As credenciais (token ou usuário/senha) ficam só no seu navegador e
nunca são exportadas. Sem analytics, sem telemetria, sem URL ou credencial
embutida no código.

## Capturas de tela

<p align="center">
  <img src="assets/pt/screenshot-2.jpeg" alt="Notificações do navegador" width="820">
  <br><br>
  <img src="assets/pt/screenshot-3.jpeg" alt="Opções e filtros" width="820">
  <br><br>
  <img src="assets/pt/screenshot-4.jpeg" alt="Privada por padrão" width="820">
</p>

## Contribuindo

Issues e pull requests são bem-vindos, em especial novas traduções. Veja
[CONTRIBUTING.md](CONTRIBUTING.md).

## Licença

[MIT](LICENSE) © Nicolas Pastorello ([@opastorello](https://github.com/opastorello))
