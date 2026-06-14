// Translate an array of lyric lines to a target language using Lovable AI.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { lines, targetLang = "English" } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");
    if (!Array.isArray(lines) || lines.length === 0) {
      return new Response(JSON.stringify({ error: "lines required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const CHUNK = 80;
    const translations: string[] = new Array(lines.length).fill("");

    for (let i = 0; i < lines.length; i += CHUNK) {
      const slice = lines.slice(i, i + CHUNK);
      const payload = slice.map((t: string, idx: number) => ({ i: i + idx, text: t }));

      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: `You are a song lyrics translator. Translate each line into ${targetLang}. Preserve meaning, tone, and poetic feel. If a line is already in ${targetLang}, return an empty string for that line. Never add commentary. Output ONLY via the set_translations function.`,
            },
            {
              role: "user",
              content: `Translate these lyric lines into ${targetLang}:\n${JSON.stringify(payload)}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "set_translations",
                description: "Return translated lyric lines",
                parameters: {
                  type: "object",
                  properties: {
                    items: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          i: { type: "integer" },
                          translation: { type: "string" },
                        },
                        required: ["i", "translation"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["items"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "set_translations" } },
          temperature: 0.3,
        }),
      });

      if (!resp.ok) {
        const t = await resp.text();
        console.error("AI gateway error", resp.status, t);
        if (resp.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limited. Try again soon." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (resp.status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: "Translation failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await resp.json();
      const tc = data.choices?.[0]?.message?.tool_calls?.[0];
      if (tc?.function?.arguments) {
        const args = JSON.parse(tc.function.arguments);
        for (const item of args.items ?? []) {
          if (typeof item.i === "number" && typeof item.translation === "string") {
            translations[item.i] = item.translation;
          }
        }
      }
    }

    return new Response(JSON.stringify({ translations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
