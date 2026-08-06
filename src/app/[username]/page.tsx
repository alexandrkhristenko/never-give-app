import { db } from '@/db';
import { users, promises, checkins } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const resolvedParams = await params;
  
  let dbUser: any, dbPromise: any, recentCheckins: { local_date: string }[] = [];
  try {
    const result = await db.select().from(users).where(eq(users.username, resolvedParams.username)).limit(1);
    dbUser = result[0];

    if (dbUser) {
      const promisesResult = await db.select().from(promises).where(eq(promises.user_id, dbUser.id)).limit(1);
      dbPromise = promisesResult[0];

      if (dbPromise && dbPromise.visibility !== 'private') {
        const checkinsResult = await db.select({ local_date: checkins.local_date }).from(checkins)
          .where(eq(checkins.promise_id, dbPromise.id))
          .orderBy(desc(checkins.local_date))
          .limit(365);
        recentCheckins = checkinsResult;
      }
    }
  } catch(e) {}

  let title = 'A new quest';
  let streak = '0';
  if (dbPromise) {
    title = dbPromise.title;
    const { current } = calculateStreak(recentCheckins.map(c => c.local_date));
    streak = current.toString();
  }

  return {
    title: `${resolvedParams.username}'s Streak - never-give.app`,
    description: `Follow ${resolvedParams.username}'s journey.`,
    openGraph: {
      images: [`/api/og?username=${resolvedParams.username}&title=${encodeURIComponent(title)}&streak=${streak}`],
    },
  };
}

function calculateStreak(checkinDates: string[]): { current: number, best: number } {
  if (checkinDates.length === 0) return { current: 0, best: 0 };
  
  const sorted = [...checkinDates].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  let currentStreak = 0;
  let bestStreak = 0;
  let tempStreak = 0;
  
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const hasCheckedInTodayOrYesterday = sorted[0] === todayStr || sorted[0] === yesterdayStr;
  
  if (!hasCheckedInTodayOrYesterday) {
    currentStreak = 0;
  }

  for (let i = 0; i < sorted.length; i++) {
    tempStreak = 1;
    let expectedNextDate = new Date(sorted[i]);
    
    for (let j = i + 1; j < sorted.length; j++) {
      expectedNextDate.setDate(expectedNextDate.getDate() - 1);
      const expectedStr = expectedNextDate.toISOString().split('T')[0];
      
      if (sorted[j] === expectedStr) {
        tempStreak++;
      } else {
        break; 
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

export default async function PublicProfilePage({ params }: PageProps) {
  const resolvedParams = await params;
  
  // Fetch user
  let dbUser: any, dbPromise: any, recentCheckins: { local_date: string }[] = [];
  try {
    const result = await db.select().from(users).where(eq(users.username, resolvedParams.username)).limit(1);
    dbUser = result[0];

    if (!dbUser) {
      notFound();
    }

    const promisesResult = await db.select().from(promises)
      .where(eq(promises.user_id, dbUser.id))
      .limit(1);
    
    dbPromise = promisesResult[0];

    // Visibility rules:
    // If it's private, nobody can see it except maybe the owner (but we are rendering a public route, so we just hide it)
    if (dbPromise && dbPromise.visibility === 'private') {
      notFound();
    }

    if (dbPromise) {
      const checkinsResult = await db.select({ local_date: checkins.local_date }).from(checkins)
        .where(eq(checkins.promise_id, dbPromise.id))
        .orderBy(desc(checkins.local_date))
        .limit(365);
      recentCheckins = checkinsResult;
    }
  } catch (e) {
    // Mock for UI dev if DB fails
    if (resolvedParams.username === 'test') {
      dbUser = { username: 'test', avatar_level: 3 };
      dbPromise = { title: 'Read 10 pages', visibility: 'public' };
      recentCheckins = [];
    } else {
      notFound();
    }
  }

  const { current: currentStreak, best: bestStreak } = calculateStreak(recentCheckins.map(c => c.local_date));

  return (
    <main className="min-h-screen p-4 md:p-8 bg-[#212529] text-white">
      <div className="max-w-3xl mx-auto">
        <div className="nes-container is-rounded bg-white text-black mb-8 p-8 flex flex-col items-center">
          <h1 className="text-3xl mb-2">{dbUser.username}</h1>
          <p className="text-gray-500 mb-8">is committing to:</p>
          <h2 className="text-2xl text-center font-bold mb-12">"{dbPromise?.title}"</h2>

          <div className="flex flex-col md:flex-row justify-around w-full items-center gap-8 mb-8">
            <div className="text-center">
              <p className="text-gray-500 text-sm mb-4">Current Streak</p>
              <p className="text-6xl text-red-500">{currentStreak}</p>
            </div>
            
            <div className="flex flex-col items-center">
               <i className={`nes-mario ${currentStreak > 0 ? 'is-moving' : ''}`} style={{transform: 'scale(2.5)', margin: '2rem'}}></i>
               <p className="text-sm mt-4">Lvl {dbUser.avatar_level}</p>
            </div>

            <div className="text-center">
              <p className="text-gray-500 text-sm mb-4">Best Streak</p>
              <p className="text-6xl">{bestStreak}</p>
            </div>
          </div>
        </div>
        
        <div className="text-center">
           <a href="/" className="nes-btn is-primary">Start Your Own Quest</a>
        </div>
      </div>
    </main>
  );
}
