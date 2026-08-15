import cfg from '../../config.js';

const paymentButton = () => ({
  interactiveMessage: {
    body: {
      text: "Silakan lakukan pembayaran melalui DANA.",
    },
    nativeFlowMessage: {
      buttons: [
        {
          name: "payment_key_info",
          buttonParamsJson: JSON.stringify({
            payment_settings: [
              {
                type: "payment_key",
                payment_key: {
                  type: "IDPAYMENTACCOUNT",
                  key: process.env.PAYMENT_KEY || "",
                  name: process.env.PAYMENT_INSTITUTION || "DANA",
                  institution_name: process.env.PAYMENT_INSTITUTION || "DANA",
                  full_name_on_account: process.env.PAYMENT_FULL_NAME || "",
                  account_type: "ewallet",
                },
              },
            ],
            share_payment_status: false,
            referral: "chat_attachment",
          }),
        },
      ],
    },
  },
});

const run = async ({ sock, jid }) => {
  await sock.message.send(jid, paymentButton());
};

const plugin = {
  run,
  name: "pay",
  command: ["pay"],
  description: "Mengirim tombol permintaan pembayaran DANA.",
  category: ["core"],
};

export default plugin;
