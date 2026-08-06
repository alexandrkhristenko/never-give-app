import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username') || 'Player';
    const streak = searchParams.get('streak') || '0';
    const title = searchParams.get('title') || 'A new quest';

    // To use a custom font like Press Start 2P in OG, you need to load the TTF file.
    // For MVP, we use the default sans-serif but stylize the blocks.
    // In a real scenario, you'd fetch the font arrayBuffer.
    
    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#212529',
            fontFamily: 'monospace', // Using fallback for now
            padding: '40px',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'white',
              border: '8px solid black',
              padding: '60px',
              width: '100%',
              height: '100%',
              boxShadow: '16px 16px 0px 0px rgba(0,0,0,1)',
            }}
          >
            <h2 style={{ fontSize: '48px', color: '#000', marginBottom: '20px' }}>
              {username}
            </h2>
            <p style={{ fontSize: '32px', color: '#666', marginBottom: '40px' }}>
              is committing to:
            </p>
            <h1 style={{ fontSize: '64px', color: '#000', fontWeight: 'bold', marginBottom: '60px', textAlign: 'center' }}>
              "{title}"
            </h1>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginRight: '60px' }}>
                <span style={{ fontSize: '24px', color: '#666' }}>Current Streak</span>
                <span style={{ fontSize: '96px', color: '#e52521', fontWeight: 'bold' }}>{streak}</span>
              </div>
              
              <div style={{ fontSize: '100px' }}>🎮</div>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      },
    );
  } catch (e: any) {
    console.log(`${e.message}`);
    return new Response(`Failed to generate the image`, {
      status: 500,
    });
  }
}
