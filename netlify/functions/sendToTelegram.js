export async function handler(event) {
  console.log("Function called");

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const data = JSON.parse(event.body);
  console.log("Form data:", data);

  const BOT_TOKEN = process.env.BOT_TOKEN;
  const CHAT_ID = process.env.CHAT_ID;

  console.log("BOT_TOKEN exists:", !!BOT_TOKEN);
  console.log("CHAT_ID:", CHAT_ID);

  const text = `
Новая заявка
Имя: ${data.name}
Телефон: ${data.phone}
Сообщение: ${data.msg || "-"}
`;

  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text
      })
    }
  );

  const result = await response.text();
  console.log("Telegram response:", result);

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true })
  };
}
