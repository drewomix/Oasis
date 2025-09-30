// import OpenAI from "openai";

// const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "INVALID" });

// export async function askChatGPT(prompt: string, context: string): Promise<string> {
//   const res = await client.chat.completions.create({
//     model: "gpt-4o-mini",
//     messages: [
//       { role: "system", content: context },   // this sets the “context”
//       { role: "user", content: prompt }       // user’s actual question
//     ],
//   });

//   return res.choices[0]?.message?.content ?? "";
// }


