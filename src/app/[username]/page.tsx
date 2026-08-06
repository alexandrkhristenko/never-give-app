import { db } from '@/db';
import { users, promises, checkins } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const resolvedParams = await params;
  return {
    title: `${resolvedParams.username}'s Streak - never-give.app`,
    description: `Follow ${resolvedParams.username}'s journey.`,
    openGraph: {
      images: [`/api/og?username=${resolvedParams.username}`],
    },
  };
}

export default async function PublicProfilePage({ params }: PageProps) {
  const resolvedParams = await params;
  
  // Fetch user
  let dbUser, dbPromise, recentCheckins = [];
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

    // Filter unlisted/private? If it's a direct link to the username, maybe they can view it.
    // The report said "unlisted (Link only)". So if they have the link, they can see it.

    if (dbPromise) {
      const checkinsResult = await db.select().from(checkins)
        .where(eq(checkins.promise_id, dbPromise.id))
        .orderBy(desc(checkins.local_date))
        .limit(30);
      recentCheckins = checkinsResult;
    }
  } catch (e) {
    // Mock for UI dev
    if (resolvedParams.username === 'test') {
      dbUser = { username: 'test', avatar_level: 3 };
      dbPromise = { title: 'Read 10 pages' };
      recentCheckins = Array.from({length: 5});
    } else {
      notFound();
    }
  }

  const currentStreak = recentCheckins.length;
  const bestStreak = Math.max(12, currentStreak);

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
