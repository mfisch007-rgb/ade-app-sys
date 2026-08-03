export default class MultiChannelAdapter {
    constructor(bus = null) {
        this.bus = bus;
        this.processedMessages = 0;
    }

    async normalizeIncomingMessage(channelType, rawPayload) {
        let normalized = {
            channel: channelType,
            sender: null,
            text: "",
            metadata: {},
            timestamp: Date.now()
        };

        if (channelType === "WHATSAPP") {
            normalized.sender = rawPayload.from || rawPayload.wa_id;
            normalized.text = rawPayload.text?.body || rawPayload.body || "";
            normalized.metadata = rawPayload;
        } else if (channelType === "USSD") {
            normalized.sender = rawPayload.phoneNumber;
            normalized.text = rawPayload.text;
            normalized.metadata = { sessionId: rawPayload.sessionId, serviceCode: rawPayload.serviceCode };
        } else if (channelType === "SMS") {
            normalized.sender = rawPayload.from;
            normalized.text = rawPayload.message;
        }

        this.processedMessages++;
        if (this.bus) {
            await this.bus.publish("channel.message.received", normalized);
        }
        return normalized;
    }
}