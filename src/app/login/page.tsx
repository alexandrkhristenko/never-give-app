'use client';

import { useState } from 'react';
import { login, signup } from './actions';
import Link from 'next/link';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    setSuccess(false);

    if (isLogin) {
      const result = await login(formData);
      if (result?.error) {
        setError(result.error);
        setLoading(false);
      }
    } else {
      const result = await signup(formData);
      if (result?.error) {
        setError(result.error);
      } else if (result?.success) {
        setSuccess(true);
        // Reset form or leave it as is
      }
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-[#212529]">
      <div className="nes-container with-title is-centered max-w-md w-full bg-white">
        <p className="title">{isLogin ? 'Sign In' : 'Register'}</p>
        
        {error && (
          <div className="nes-text is-error mb-4">
            <p>{error}</p>
          </div>
        )}

        {success ? (
          <div className="text-center py-8">
            <i className="nes-icon is-large star mb-4"></i>
            <p className="nes-text is-success mb-4">Registration successful!</p>
            <p>Please check your email to verify your account before logging in.</p>
            <button 
              type="button" 
              className="nes-btn mt-6"
              onClick={() => {
                setSuccess(false);
                setIsLogin(true);
              }}
            >
              Back to Sign In
            </button>
          </div>
        ) : (
          <form action={handleSubmit} className="flex flex-col gap-6 text-left">
            <div className="nes-field">
              <label htmlFor="email">Email</label>
              <input 
                type="email" 
                id="email" 
                name="email" 
                className="nes-input" 
                required 
              />
            </div>
            
            <div className="nes-field">
              <label htmlFor="password">Password</label>
              <input 
                type="password" 
                id="password" 
                name="password" 
                className="nes-input" 
                required 
              />
            </div>

            <button 
              type="submit" 
              className={`nes-btn is-primary w-full ${loading ? 'is-disabled' : ''}`}
              disabled={loading}
            >
              {loading ? 'Please wait...' : (isLogin ? 'Sign In' : 'Sign Up')}
            </button>
            
            <div className="text-center mt-2">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError(null);
                }}
                className="nes-text is-primary hover:underline bg-transparent border-none cursor-pointer p-0"
              >
                {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
              </button>
            </div>
          </form>
        )}
        
        <div className="mt-8 pt-4 border-t-4 border-black text-center">
          <Link href="/" className="nes-text">
            ← Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
