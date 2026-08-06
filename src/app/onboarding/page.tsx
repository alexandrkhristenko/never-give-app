import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { users, promises } from '@/db/schema';
import { eq } from 'drizzle-orm';

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  // Attempt to fetch existing user
  let existingUser = null;
  try {
    const result = await db.select().from(users).where(eq(users.email, user.email!)).limit(1);
    existingUser = result[0];
  } catch (error) {
    // If DB is not yet set up or env vars missing, we'll swallow this for now
    // In production, this should throw
  }

  if (existingUser && existingUser.username) {
    redirect('/dashboard');
  }

  async function completeOnboarding(formData: FormData) {
    'use server';
    const username = formData.get('username') as string;
    const promiseTitle = formData.get('promise') as string;
    const visibility = formData.get('visibility') as string;
    const timezone = formData.get('timezone') as string || 'UTC';

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return;

    try {
      // 1. Create or update user
      const [newUser] = await db.insert(users).values({
        id: user.id, // using supabase uuid
        email: user.email!,
        username,
        timezone
      }).onConflictDoUpdate({
        target: users.email,
        set: { username, timezone }
      }).returning();

      // 2. Create the promise
      await db.insert(promises).values({
        user_id: newUser.id,
        title: promiseTitle,
        visibility: visibility,
        cadence: 'daily',
        status: 'active'
      });
    } catch (e) {
      console.error(e);
      // Handle error (e.g. username taken)
      return;
    }

    redirect('/dashboard');
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-[#212529]">
      <div className="nes-container is-rounded bg-white max-w-lg w-full">
        <h2 className="title text-center mb-6 text-xl">Welcome, Player 1!</h2>
        <form action={completeOnboarding} className="flex flex-col gap-6">
          
          <div className="nes-field">
            <label htmlFor="username">Choose a Username</label>
            <input type="text" id="username" name="username" className="nes-input" required pattern="^[a-zA-Z0-9_]{3,20}$" title="Alphanumeric and underscores, 3-20 characters"/>
            <span className="text-xs text-gray-500 block mt-2">never-give.app/username</span>
          </div>

          <div className="nes-field">
            <label htmlFor="promise">Your Main Promise</label>
            <input type="text" id="promise" name="promise" className="nes-input" placeholder="e.g. Code every day" required />
          </div>

          <div className="nes-field">
            <label htmlFor="visibility">Profile Visibility</label>
            <div className="nes-select">
              <select required id="visibility" name="visibility">
                <option value="public">Public (Recommended)</option>
                <option value="unlisted">Unlisted (Link only)</option>
              </select>
            </div>
          </div>
          
          <input type="hidden" name="timezone" id="timezone" value="" />

          <button type="submit" className="nes-btn is-primary w-full mt-4">Start Game</button>
        </form>
      </div>

      {/* Script to inject local timezone */}
      <script dangerouslySetInnerHTML={{
        __html: `document.getElementById('timezone').value = Intl.DateTimeFormat().resolvedOptions().timeZone;`
      }} />
    </main>
  );
}
