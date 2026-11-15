'use strict';

/**
 * interactive.js — envoi de messages interactifs natifs (boutons / listes)
 * via Baileys 7, qui ne les genere plus depuis sendMessage.
 */

const {
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  proto
} = require('@whiskeysockets/baileys');

const BIZ_NODES = [
  {
    tag: 'biz',
    attrs: {},
    content: [
      {
        tag: 'interactive',
        attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
      }
    ]
  }
];

function toNativeButton(b) {
  if (b.sections) {
    return {
      name: 'single_select',
      buttonParamsJson: JSON.stringify({ title: b.label, sections: b.sections })
    };
  }
  if (b.url) {
    return {
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text: b.label,
        url: b.url,
        merchant_url: b.url
      })
    };
  }
  return {
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({
      display_text: b.label,
      id: b.id || b.label
    })
  };
}

async function sendNativeButtons(sock, jid, opts) {
  const { text, footer = '', buttons, quoted, image } = opts;
  const { Body, Footer, Header, NativeFlowMessage } = proto.Message.InteractiveMessage;

  if (!Array.isArray(buttons) || buttons.length === 0) {
    throw new Error('Aucun bouton a envoyer.');
  }

  let header = Header.fromObject({ title: '', hasMediaAttachment: false });
  if (image) {
    const media = await prepareWAMessageMedia(
      { image },
      { upload: sock.waUploadToServer }
    );
    header = Header.fromObject({
      title: '',
      hasMediaAttachment: true,
      imageMessage: media.imageMessage
    });
  }

  const interactive = {
    header,
    body: Body.fromObject({ text }),
    nativeFlowMessage: NativeFlowMessage.fromObject({
      buttons: buttons.map(toNativeButton)
    })
  };
  if (footer) interactive.footer = Footer.fromObject({ text: footer });

  const content = generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2
          },
          interactiveMessage: proto.Message.InteractiveMessage.fromObject(interactive)
        }
      }
    },
    { quoted, userJid: sock.user ? sock.user.id : undefined }
  );

  await sock.relayMessage(jid, content.message, {
    messageId: content.key.id,
    additionalNodes: BIZ_NODES
  });

  return content;
}

function unwrap(message) {
  let current = message;
  for (let i = 0; i < 5 && current; i++) {
    const inner =
      current.ephemeralMessage ||
      current.viewOnceMessage ||
      current.viewOnceMessageV2 ||
      current.viewOnceMessageV2Extension ||
      current.documentWithCaptionMessage ||
      current.editedMessage ||
      current.deviceSentMessage;
    if (!inner || !inner.message) break;
    current = inner.message;
  }
  return current || {};
}

function extractReplyId(msg) {
  const m = unwrap(msg && msg.message ? msg.message : {});

  const flow = m.interactiveResponseMessage && m.interactiveResponseMessage.nativeFlowResponseMessage;
  if (flow && flow.paramsJson) {
    try {
      const parsed = JSON.parse(flow.paramsJson);
      if (parsed && parsed.id) return String(parsed.id);
    } catch (e) {
      return null;
    }
  }

  return (
    (m.buttonsResponseMessage && m.buttonsResponseMessage.selectedButtonId) ||
    (m.listResponseMessage && m.listResponseMessage.singleSelectReply && m.listResponseMessage.singleSelectReply.selectedRowId) ||
    (m.templateButtonReplyMessage && m.templateButtonReplyMessage.selectedId) ||
    null
  );
}

module.exports = {
  BIZ_NODES,
  sendNativeButtons,
  extractReplyId
};
