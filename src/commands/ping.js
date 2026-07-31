export default {
  name: "ping",
  description: "Check if the bot is alive",

  async execute(sock, msg) {
    const jid = msg.key.remoteJid

    await sock.sendMessage(jid, {
      text: "🏓 Pong! LedgerFlow bot is running."
    })
  }
}
