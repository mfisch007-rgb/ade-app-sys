// ADE — Command Parser Engine
// File: src/engines/commandParser.js

function parseCommand(message) {
  const clean = message.trim().replace(/\s+/g, ' ').toUpperCase();
  const tokens = clean.split(' ');

  if (tokens.length < 1 || !tokens[0]) {
    return { error: 'EMPTY_COMMAND' };
  }
  if (tokens.length > 6) {
    return { error: 'COMMAND_TOO_LONG' };
  }

  return {
    action: tokens[0],
    target: tokens[1] || null,
    value:  tokens[2] || null,
    extra1: tokens[3] || null,
    extra2: tokens[4] || null,
    raw:    message
  };
}

const patterns = [
  {
    regex: /(?:sold?|selling|i sold?)\s+(.+?)\s+(?:for\s+)?(\d+\.?\d*k?)/i,
    action: 'SALE'
  },
  {
    regex: /(?:spent?|spending|paid for|expense)\s+(.+?)\s+(?:for\s+)?(\d+\.?\d*k?)/i,
    action: 'EXPENSE'
  },
  {
    regex: /(?:owes?|debt|borrowed?|credit)\s+(.+?)\s+(\d+\.?\d*k?)/i,
    action: 'DEBT'
  },
  {
    regex: /(?:paid|payment from|received from)\s+(.+?)\s+(\d+\.?\d*k?)/i,
    action: 'PAID'
  },
  {
    regex: /(?:withdrew?|withdrawal|took out)\s+(\d+\.?\d*k?)/i,
    action: 'WITHDRAW',
    singleValue: true
  }
];

function convertAmount(val) {
  if (!val) return null;
  const str = val.toString().toLowerCase();
  if (str.endsWith('k')) {
    return parseFloat(str) * 1000;
  }
  return parseFloat(str);
}

function intelligentParse(message) {
  const strict = parseCommand(message);
  if (!strict.error) return strict;

  for (const pattern of patterns) {
    const match = message.match(pattern.regex);
    if (match) {
      if (pattern.singleValue) {
        return {
          action: pattern.action,
          target: null,
          value:  convertAmount(match[1]),
          raw:    message,
          parsed_by: 'intelligence'
        };
      }
      return {
        action: pattern.action,
        target: match[1].trim().toUpperCase(),
        value:  convertAmount(match[2]),
        raw:    message,
        parsed_by: 'intelligence'
      };
    }
  }

  return { error: 'UNRECOGNISED_COMMAND', raw: message };
}

const commandSchema = {
  SALE:      ['target', 'value'],
  EXPENSE:   ['target', 'value'],
  DEBT:      ['target', 'value'],
  PAID:      ['target', 'value'],
  STOCK:     ['target', 'value', 'extra1'],
  BUY:       ['target', 'value', 'extra1'],
  WITHDRAW:  ['target'],
  TRANSFER:  ['target', 'value'],
  CONTRIB:   ['target', 'value'],
  DRUGSTOCK: ['target', 'value', 'extra1'],
  DRUGSALE:  ['target', 'value'],
  START:     [],
  HELP:      [],
  SUBSTATUS: [],
  CONTACT:   [],
};

function validateCommand(cmd) {
  if (!cmd.action) return 'No command detected. Type HELP to see commands.';
  const required = commandSchema[cmd.action];
  if (required === undefined) {
    return `Unknown command: ${cmd.action}. Type HELP to see commands.`;
  }
  for (const field of required) {
    if (!cmd[field]) {
      return `Missing info. Usage: ${cmd.action} ${required.join(' ').toUpperCase()}`;
    }
  }
  return true;
}

module.exports = {
  parseCommand,
  intelligentParse,
  validateCommand,
  convertAmount
};