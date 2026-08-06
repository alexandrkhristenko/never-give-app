import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect('/dashboard');
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center bg-[#212529]">
      <div className="nes-container with-title is-centered max-w-2xl w-full bg-white">
        <p className="title">never-give.app</p>
        
        <h1 className="text-3xl md:text-4xl mb-6">
          <i className="nes-icon trophy is-large mb-4"></i><br/>
          Public Accountability
        </h1>
        
        <p className="mb-8">Commit to a habit. Share your streak. Don't give up.</p>

        <section className="flex flex-col gap-4 items-center max-w-xs mx-auto">
          <form action="/auth/signin" method="post" className="w-full">
            <input type="hidden" name="provider" value="google" />
            <button type="submit" className="nes-btn is-error w-full flex items-center justify-center gap-2">
              <i className="nes-icon google is-small"></i> Sign in with Google
            </button>
          </form>
          
          <form action="/auth/signin" method="post" className="w-full">
            <input type="hidden" name="provider" value="github" />
            <button type="submit" className="nes-btn is-dark w-full flex items-center justify-center gap-2">
              <i className="nes-icon github is-small"></i> Sign in with GitHub
            </button>
          </form>
          
          <div className="w-full text-center my-2 text-gray-500">
            <span>or</span>
          </div>

          <Link href="/login" className="nes-btn is-primary w-full flex items-center justify-center gap-2">
            Continue with Email
          </Link>
        </section>
      </div>
    </main>
  );
}
