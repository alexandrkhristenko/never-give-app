import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { users, promises, checkins } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  // Fetch data
  let dbUser, dbPromise, recentCheckins = [];
  try {
    const result = await db.select().from(users).where(eq(users.email, user.email!)).limit(1);
    dbUser = result[0];
    
    if (!dbUser || !dbUser.username) {
      redirect('/onboarding');
    }

    const promisesResult = await db.select().from(promises).where(eq(promises.user_id, dbUser.id)).limit(1);
    dbPromise = promisesResult[0];

    if (dbPromise) {
       const checkinsResult = await db.select().from(checkins)
        .where(eq(checkins.promise_id, dbPromise.id))
        .orderBy(desc(checkins.local_date))
        .limit(30);
       recentCheckins = checkinsResult;
    }

  } catch(e) {
    // Mocking for UI presentation before DB is fully migrated
    dbUser = { username: 'player1', avatar_level: 5 };
    dbPromise = { title: 'Code every day' };
  }

  // Very simplified streak calculation for MVP mock
  const currentStreak = recentCheckins.length; // Will need real date-based calc later
  const bestStreak = Math.max(12, currentStreak); // Mock logic

  async function handleCheckin() {
    'use server';
    // Logic to insert checkin for today based on user timezone
    // ...
    // revalidatePath('/dashboard');
  }

  return (
    <main className="min-h-screen p-4 md:p-8 bg-[#212529] text-white">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        
        <header className="flex flex-col md:flex-row justify-between items-center bg-white p-4 nes-container is-rounded">
          <div className="text-black text-center md:text-left mb-4 md:mb-0">
            <h1 className="text-2xl mb-1">never-give.app</h1>
            <p className="text-gray-500 text-sm">Player: {dbUser.username}</p>
          </div>
          <div className="flex gap-4">
            <Link href={`/${dbUser.username}`} className="nes-btn is-primary">View Public</Link>
          </div>
        </header>

        <section className="nes-container with-title bg-white text-black">
          <p className="title">Active Quest</p>
          <h2 className="text-2xl mb-8 text-center">{dbPromise?.title || 'No promise set'}</h2>
          
          <div className="flex flex-col md:flex-row justify-around items-center gap-8 mb-12">
            <div className="text-center">
              <p className="text-gray-500 text-sm mb-4">Current Streak</p>
              <p className="text-5xl text-red-500">{currentStreak}</p>
            </div>
            
            <div className="flex flex-col items-center">
               <i className={`nes-mario ${currentStreak > 0 ? 'is-moving' : ''} mb-4`} style={{transform: 'scale(2)'}}></i>
               <p className="text-sm mt-4">Lvl {dbUser.avatar_level}</p>
            </div>

            <div className="text-center">
              <p className="text-gray-500 text-sm mb-4">Best Streak</p>
              <p className="text-5xl">{bestStreak}</p>
            </div>
          </div>

          <form action={handleCheckin} className="flex justify-center">
             <button type="submit" className="nes-btn is-success is-large text-xl px-12 py-4">
               CHECK IN TODAY
             </button>
          </form>
        </section>

      </div>
    </main>
  );
}
