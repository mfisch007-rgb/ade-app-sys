export function registerChannelIdentity({ channel, identifier, apiKey }) {
    const isPhone = /^\+?[0-9]{10,15}$/.test(identifier);
    return {
        channel: channel.toUpperCase(),
        identifier,
        hasApiKey: Boolean(apiKey),
        status: apiKey ? "PROVIDER_CONNECTED" : (isPhone ? "NUMBER_REGISTERED" : "CONFIGURATION_REQUIRED"),
        pipeline: ["Inbound", "Normalization", "Routing", "Workflow", "Execution", "Audit"],
        verifiedAt: new Date().toISOString()
    };
}
