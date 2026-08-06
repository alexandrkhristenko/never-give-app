import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { users, promises, checkins } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';

function calculateStreak(checkinDates: string[]): { current: number, best: number } {
  if (checkinDates.length === 0) return { current: 0, best: 0 };
  
  // Sort dates descending
  const sorted = [...checkinDates].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  
  let currentStreak = 0;
  let bestStreak = 0;
  let tempStreak = 0;
  
  // Get today's date in local YYYY-MM-DD
  const now = new Date();
  // We'll roughly use UTC string for simplicity, but ideally we use user's timezone.
  // For strictness, if the most recent check-in is not today or yesterday, current streak is 0.
  const todayStr = now.toISOString().split('T')[0];
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const hasCheckedInTodayOrYesterday = sorted[0] === todayStr || sorted[0] === yesterdayStr;
  
  if (!hasCheckedInTodayOrYesterday) {
    currentStreak = 0;
  }

  // Calculate best streak and temp current streak
  for (let i = 0; i < sorted.length; i++) {
    tempStreak = 1;
    let expectedNextDate = new Date(sorted[i]);
    
    for (let j = i + 1; j < sorted.length; j++) {
      expectedNextDate.setDate(expectedNextDate.getDate() - 1);
      const expectedStr = expectedNextDate.toISOString().split('T')[0];
      
      if (sorted[j] === expectedStr) {
        tempStreak++;
      } else {
        break; // Streak broken
      }
    }
    
    if (i === 0 && hasCheckedInTodayOrYesterday) {
      currentStreak = tempStreak;
    }
    
    if (tempStreak > bestStreak) {
      bestStreak = tempStreak;
    }
  }

  return { current: currentStreak, best: bestStreak };
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  let dbUser: any, dbPromise: any, recentCheckins: { local_date: string }[] = [];
  try {
    const result = await db.select().from(users).where(eq(users.email, user.email!)).limit(1);
    dbUser = result[0];
    
    if (!dbUser || !dbUser.username) {
      redirect('/onboarding');
    }

    const promisesResult = await db.select().from(promises).where(eq(promises.user_id, dbUser.id)).limit(1);
    dbPromise = promisesResult[0];

    if (dbPromise) {
       const checkinsResult = await db.select({ local_date: checkins.local_date }).from(checkins)
        .where(eq(checkins.promise_id, dbPromise.id))
        .orderBy(desc(checkins.local_date))
        .limit(365); // Last year for streak calc
       recentCheckins = checkinsResult;
    }

  } catch(e) {
    // If DB connection fails, redirect or show error
    dbUser = { username: 'player1', avatar_level: 1, timezone: 'UTC' };
    dbPromise = { title: 'Set up your database first!' };
  }

  const { current: currentStreak, best: bestStreak } = calculateStreak(recentCheckins.map(c => c.local_date));

  async function handleCheckin() {
    'use server';
    if (!dbPromise) return;
    
    // Get user's timezone date string (e.g. YYYY-MM-DD)
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: dbUser?.timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const localDate = formatter.format(new Date());

    try {
      await db.insert(checkins).values({
        promise_id: dbPromise.id,
        local_date: localDate,
      }).onConflictDoNothing(); // Prevent double check-ins
      
      revalidatePath('/dashboard');
      revalidatePath(`/${dbUser?.username}`);
    } catch (e) {
      console.error("Failed to check in", e);
    }
  }

  // Check if already checked in today
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: dbUser?.timezone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const todayStr = formatter.format(new Date());
  const hasCheckedInToday = recentCheckins.some(c => c.local_date === todayStr);

  return (
    <main className="min-h-screen p-4 md:p-8 bg-[#212529] text-white">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        
        <header className="flex flex-col md:flex-row justify-between items-center bg-white p-4 nes-container is-rounded">
          <div className="text-black text-center md:text-left mb-4 md:mb-0">
            <h1 className="text-2xl mb-1">never-give.app</h1>
            <p className="text-gray-500 text-sm">Player: {dbUser?.username}</p>
          </div>
          <div className="flex gap-4">
            <Link href={`/${dbUser?.username}`} className="nes-btn is-primary">View Public</Link>
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
               <i className={`nes-mario ${currentStreak > 0 && !hasCheckedInToday ? 'is-moving' : ''} mb-4`} style={{transform: 'scale(2)'}}></i>
               <p className="text-sm mt-4">Lvl {dbUser?.avatar_level}</p>
            </div>

            <div className="text-center">
              <p className="text-gray-500 text-sm mb-4">Best Streak</p>
              <p className="text-5xl">{bestStreak}</p>
            </div>
          </div>

          <form action={handleCheckin} className="flex justify-center">
             <button 
                type="submit" 
                className={`nes-btn is-large text-xl px-12 py-4 ${hasCheckedInToday ? 'is-disabled' : 'is-success'}`}
                disabled={hasCheckedInToday}
             >
               {hasCheckedInToday ? 'DONE FOR TODAY' : 'CHECK IN TODAY'}
             </button>
          </form>
        </section>

      </div>
    </main>
  );
}
