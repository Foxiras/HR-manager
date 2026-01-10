exports.handler = async (event) => {
  console.log("Function called");

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let data = {};
  try {
    data = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: "Bad JSON" };
  }

  const BOT_TOKEN = process.env.BOT_TOKEN;
  const CHAT_ID = process.env.CHAT_ID;

  console.log("BOT_TOKEN exists:", !!BOT_TOKEN);
  console.log("CHAT_ID:", CHAT_ID);

  const text =
    `Новая заявка\n` +
    `Имя: ${data.name || "-"}\n` +
    `Телефон: ${data.phone || "-"}\n` +
    `Сообщение: ${data.msg || "-"}`;

  if (!BOT_TOKEN || !CHAT_ID) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Missing env vars" }),
    };
  }

  const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
    }),
  });

  const tg = await resp.text();
  console.log("Telegram response:", tg);

  return { statusCode: resp.ok ? 200 : 500, body: tg };
};
