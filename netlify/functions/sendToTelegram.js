// netlify/functions/sendToTelegram.js
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Bad JSON" };
  }

  const BOT_TOKEN = process.env.BOT_TOKEN;
  const CHAT_ID = process.env.CHAT_ID;

  if (!BOT_TOKEN || !CHAT_ID) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: "Missing BOT_TOKEN or CHAT_ID" }),
    };
  }

  const name = (data.name || "").toString().trim();
  const phone = (data.phone || "").toString().trim();
  const msg = (data.msg || "").toString().trim();

  const text =
    `Новая заявка\n` +
    `Имя: ${name || "-"}\n` +
    `Телефон: ${phone || "-"}\n` +
    `Сообщение: ${msg || "-"}`;

  const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
    }),
  });

  const tgBody = await tgRes.text();

  if (!tgRes.ok) {
    // Отдаём ошибку, чтобы фронт показал "не удалось"
    return { statusCode: 502, body: tgBody };
  }

  return { statusCode: 200, body: tgBody };
};
