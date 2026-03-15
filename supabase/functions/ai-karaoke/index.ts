// @ts-ignore - Deno.serve is available in edge runtime

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { lines, duration } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    if (!lines || lines.length === 0) {
      return new Response(
        JSON.stringify({ error: "No lyrics lines provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Process in chunks for large songs to avoid token limits
    const CHUNK_SIZE = 40;
    const allWords: any[] = [];

    for (let chunkStart = 0; chunkStart < lines.length; chunkStart += CHUNK_SIZE) {
      const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, lines.length);
      const chunkLines = lines.slice(chunkStart, chunkEnd);

      const lyricsData = chunkLines.map((l: { text: string; time: number }, i: number) => {
        const globalIdx = chunkStart + i;
        const nextTime = globalIdx + 1 < lines.length ? lines[globalIdx + 1].time : (duration ?? l.time + 5);
        return {
          index: globalIdx,
          text: l.text,
          startTime: l.time,
          endTime: nextTime,
          wordCount: l.text.split(/\s+/).filter((w: string) => w.length > 0).length,
        };
      });

      const prompt = `Generate word-by-word karaoke timing for these ${chunkLines.length} lyric lines (indices ${chunkStart}-${chunkEnd - 1}).

RULES:
1. Split each line's "text" by whitespace. Output EXACTLY those words in order - no additions, deletions, or modifications.
2. Each line at index N: first word starts at or just after startTime, last word ends at or just before endTime.
3. Words with more syllables get proportionally more time.
4. Short words (a, the, I, in, to) get ~0.1-0.2s.
5. Leave 0.02-0.05s gaps between words.
6. Times in seconds, 2 decimal places.
7. lineIndex must match the "index" field exactly.
8. For line with wordCount W, output exactly W words.
9. Do NOT repeat words, skip words, or invent words.

Data:
${JSON.stringify(lyricsData, null, 1)}`;

      const response = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
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
                content: "You are a precise karaoke timing generator. Output ONLY via the set_karaoke_words function. Each word must exactly match the input. Output the exact number of words per line as specified by wordCount.",
              },
              { role: "user", content: prompt },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "set_karaoke_words",
                  description: "Set karaoke word timings",
                  parameters: {
                    type: "object",
                    properties: {
                      words: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            word: { type: "string" },
                            startTime: { type: "number" },
                            endTime: { type: "number" },
                            lineIndex: { type: "integer" },
                          },
                          required: ["word", "startTime", "endTime", "lineIndex"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["words"],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "set_karaoke_words" } },
            temperature: 0.05,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("AI gateway error:", response.status, errorText);

        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limited. Please try again in a moment.", processedLines: allWords.length > 0 ? chunkStart : 0 }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ error: "AI generation failed" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

      if (toolCall?.function?.arguments) {
        const args = JSON.parse(toolCall.function.arguments);

        if (args.words && Array.isArray(args.words)) {
          // Validate each word
          const validWords = args.words.filter((w: any) => {
            if (!w.word || typeof w.startTime !== 'number' || typeof w.endTime !== 'number' || typeof w.lineIndex !== 'number') return false;
            if (w.lineIndex < chunkStart || w.lineIndex >= chunkEnd) return false;
            if (w.word.includes('<') || w.word.includes('>') || w.word.includes('{') || w.word.includes('//')) return false;
            if (w.startTime < 0 || w.endTime < w.startTime || w.endTime > duration + 5) return false;
            return true;
          });

          // Per-line validation: check word counts match
          for (const ld of lyricsData) {
            const lineWords = validWords.filter((w: any) => w.lineIndex === ld.index);
            const expectedCount = ld.wordCount;
            // If AI gave wrong count, redistribute timing evenly
            if (lineWords.length !== expectedCount) {
              // Remove AI's attempt for this line
              const otherWords = validWords.filter((w: any) => w.lineIndex !== ld.index);
              const inputWords = ld.text.split(/\s+/).filter((w: string) => w.length > 0);
              const lineDuration = ld.endTime - ld.startTime;
              const wordDuration = lineDuration / inputWords.length;
              
              const fixedWords = inputWords.map((word: string, idx: number) => ({
                word,
                startTime: Number((ld.startTime + idx * wordDuration).toFixed(2)),
                endTime: Number((ld.startTime + (idx + 1) * wordDuration).toFixed(2)),
                lineIndex: ld.index,
              }));

              // Replace in validWords
              validWords.length = 0;
              validWords.push(...otherWords, ...fixedWords);
            }
          }

          allWords.push(...validWords);
        }
      }
    }

    if (allWords.length === 0) {
      return new Response(
        JSON.stringify({ error: "AI generated no valid timing data. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Final validation
    let totalInputWords = 0;
    for (const l of lines) {
      totalInputWords += l.text.split(/\s+/).filter((w: string) => w.length > 0).length;
    }

    if (allWords.length > totalInputWords * 1.5 || allWords.length < totalInputWords * 0.3) {
      console.error(`Word count mismatch: input=${totalInputWords}, output=${allWords.length}`);
      return new Response(
        JSON.stringify({ error: "AI output was inconsistent. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sort by time
    allWords.sort((a, b) => a.startTime - b.startTime);

    return new Response(JSON.stringify({ words: allWords, totalLines: lines.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("AI karaoke error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
