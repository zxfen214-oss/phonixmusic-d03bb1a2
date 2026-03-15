import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RequestAdminChangePayload {
  songTitle: string;
  songArtist: string;
  songAlbum: string;
  songDuration: number;
  youtubeId?: string;
  userEmail?: string;
  userName?: string;
  message?: string;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: RequestAdminChangePayload = await req.json();

    const { 
      songTitle, 
      songArtist, 
      songAlbum, 
      songDuration,
      youtubeId,
      userEmail,
      userName,
      message 
    } = payload;

    // Validate required fields
    if (!songTitle || !songArtist) {
      throw new Error("Missing required song information");
    }

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #e53935; margin-bottom: 24px;">🎵 Song Change Request</h1>
        
        <div style="background: #f5f5f5; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
          <h2 style="margin: 0 0 16px 0; color: #333;">Song Details</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; width: 100px;">Title:</td>
              <td style="padding: 8px 0; color: #333; font-weight: 500;">${songTitle}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">Artist:</td>
              <td style="padding: 8px 0; color: #333; font-weight: 500;">${songArtist}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">Album:</td>
              <td style="padding: 8px 0; color: #333; font-weight: 500;">${songAlbum || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">Duration:</td>
              <td style="padding: 8px 0; color: #333; font-weight: 500;">${formatDuration(songDuration)}</td>
            </tr>
            ${youtubeId ? `
            <tr>
              <td style="padding: 8px 0; color: #666;">YouTube ID:</td>
              <td style="padding: 8px 0; color: #333; font-weight: 500;">
                <a href="https://youtube.com/watch?v=${youtubeId}" style="color: #e53935;">${youtubeId}</a>
              </td>
            </tr>
            ` : ''}
          </table>
        </div>
        
        <div style="background: #f5f5f5; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
          <h2 style="margin: 0 0 16px 0; color: #333;">Request Details</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; width: 100px;">From:</td>
              <td style="padding: 8px 0; color: #333; font-weight: 500;">${userName || 'Anonymous User'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">Email:</td>
              <td style="padding: 8px 0; color: #333; font-weight: 500;">${userEmail || 'Not provided'}</td>
            </tr>
          </table>
        </div>
        
        ${message ? `
        <div style="background: #fff3e0; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
          <h2 style="margin: 0 0 16px 0; color: #333;">User Message</h2>
          <p style="color: #333; margin: 0; white-space: pre-wrap;">${message}</p>
        </div>
        ` : ''}
        
        <p style="color: #666; font-size: 14px; margin-top: 24px;">
          This request was sent from Phonix Music app.
        </p>
      </div>
    `;

    const emailResponse = await resend.emails.send({
      from: "Phonix Music <noreply@phonixmusic.lovable.app>",
      to: ["mahmedkhan1@icloud.com"],
      subject: `Song Change Request: ${songTitle} by ${songArtist}`,
      html: emailHtml,
    });

    console.log("Admin request email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in request-admin-change function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
