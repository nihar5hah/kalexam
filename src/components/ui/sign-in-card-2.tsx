'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion';
import { ArrowRight, Eye, EyeClosed, Globe, Lock, Mail, Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className
      )}
      {...props}
    />
  );
}

type AuthMode = 'signin' | 'signup';

type SignInCard2Props = {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  email: string;
  onEmailChange: (value: string) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  onEmailSubmit: () => Promise<void>;
  onGoogleSubmit: () => Promise<void>;
  isLoading: boolean;
  error?: string | null;
  helperMessage?: string | null;
};

export function SignInCard2({
  mode,
  onModeChange,
  email,
  onEmailChange,
  password,
  onPasswordChange,
  onEmailSubmit,
  onGoogleSubmit,
  isLoading,
  error,
  helperMessage,
}: SignInCard2Props) {
  const [showPassword, setShowPassword] = useState(false);
  const [focusedInput, setFocusedInput] = useState<'email' | 'password' | null>(null);
  const [rememberMe, setRememberMe] = useState(false);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useTransform(mouseY, [-300, 300], [8, -8]);
  const rotateY = useTransform(mouseX, [-300, 300], [-8, 8]);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    mouseX.set(event.clientX - rect.left - rect.width / 2);
    mouseY.set(event.clientY - rect.top - rect.height / 2);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  const submitLabel = mode === 'signin' ? 'Sign In' : 'Create Account';

  async function handleSubmit() {
    await onEmailSubmit();
  }

  return (
    <div className="min-h-screen w-screen bg-[#050505] relative overflow-hidden flex items-center justify-center text-white">
      <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/30 via-violet-700/40 to-black pointer-events-none" />

      <div
        className="absolute inset-0 opacity-[0.03] mix-blend-soft-light pointer-events-none"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")',
          backgroundSize: '200px 200px',
        }}
      />

      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120vh] h-[60vh] rounded-b-[50%] bg-indigo-400/15 blur-[80px] pointer-events-none" />
      <motion.div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[90vh] h-[90vh] rounded-t-full bg-violet-400/20 blur-[60px] pointer-events-none"
        animate={{ opacity: [0.3, 0.5, 0.3], scale: [1, 1.1, 1] }}
        transition={{ duration: 6, repeat: Infinity, repeatType: 'mirror', delay: 1 }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="w-full max-w-sm relative z-10"
        style={{ perspective: 1400 }}
      >
        <motion.div
          className="relative"
          style={{ rotateX, rotateY }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          whileHover={{ z: 10 }}
        >
          <div className="relative group">
            <motion.div
              className="absolute -inset-[1px] rounded-2xl opacity-0 group-hover:opacity-70 transition-opacity duration-700"
              animate={{
                boxShadow: [
                  '0 0 10px 2px rgba(255,255,255,0.03)',
                  '0 0 15px 5px rgba(255,255,255,0.05)',
                  '0 0 10px 2px rgba(255,255,255,0.03)',
                ],
                opacity: [0.2, 0.4, 0.2],
              }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', repeatType: 'mirror' }}
            />

            <div className="relative bg-black/45 backdrop-blur-xl rounded-2xl p-6 border border-white/[0.08] shadow-2xl overflow-hidden">
              <div
                className="absolute inset-0 opacity-[0.03]"
                style={{
                  backgroundImage:
                    'linear-gradient(135deg, white 0.5px, transparent 0.5px), linear-gradient(45deg, white 0.5px, transparent 0.5px)',
                  backgroundSize: '30px 30px',
                }}
              />

              <div className="text-center space-y-1 mb-5 relative z-10">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', duration: 0.8 }}
                  className="mx-auto w-10 h-10 rounded-full border border-white/10 flex items-center justify-center relative overflow-hidden"
                >
                  <Sparkles className="w-5 h-5 text-white/85" />
                  <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-50" />
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-white to-white/80"
                >
                  {mode === 'signin' ? 'Welcome Back' : 'Create Your Account'}
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-white/60 text-xs"
                >
                  {mode === 'signin' ? 'Sign in to continue to KalExam' : 'Sign up to start your prep journey'}
                </motion.p>
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSubmit();
                }}
                className="space-y-4 relative z-10"
              >
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onModeChange('signin')}
                    className={cn(
                      'h-9 rounded-lg text-xs border transition-colors',
                      mode === 'signin'
                        ? 'bg-white text-black border-white'
                        : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'
                    )}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => onModeChange('signup')}
                    className={cn(
                      'h-9 rounded-lg text-xs border transition-colors',
                      mode === 'signup'
                        ? 'bg-white text-black border-white'
                        : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'
                    )}
                  >
                    Sign Up
                  </button>
                </div>

                {error ? <p className="text-xs text-red-300">{error}</p> : null}
                {!error && helperMessage ? <p className="text-xs text-amber-200">{helperMessage}</p> : null}

                <motion.div className="space-y-3">
                  <motion.div
                    className={cn('relative', focusedInput === 'email' ? 'z-10' : '')}
                    whileHover={{ scale: 1.01 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  >
                    <div className="relative flex items-center overflow-hidden rounded-lg">
                      <Mail
                        className={cn(
                          'absolute left-3 w-4 h-4 transition-all duration-300',
                          focusedInput === 'email' ? 'text-white' : 'text-white/40'
                        )}
                      />

                      <Input
                        type="email"
                        placeholder="Email address"
                        value={email}
                        onChange={(event) => onEmailChange(event.target.value)}
                        onFocus={() => setFocusedInput('email')}
                        onBlur={() => setFocusedInput(null)}
                        className="w-full bg-white/5 border-transparent focus:border-white/20 text-white placeholder:text-white/30 h-10 transition-all duration-300 pl-10 pr-3 focus:bg-white/10"
                      />

                      {focusedInput === 'email' && (
                        <motion.div
                          layoutId="input-highlight"
                          className="absolute inset-0 bg-white/5 -z-10"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                        />
                      )}
                    </div>
                  </motion.div>

                  <motion.div
                    className={cn('relative', focusedInput === 'password' ? 'z-10' : '')}
                    whileHover={{ scale: 1.01 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  >
                    <div className="relative flex items-center overflow-hidden rounded-lg">
                      <Lock
                        className={cn(
                          'absolute left-3 w-4 h-4 transition-all duration-300',
                          focusedInput === 'password' ? 'text-white' : 'text-white/40'
                        )}
                      />

                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Password"
                        value={password}
                        onChange={(event) => onPasswordChange(event.target.value)}
                        onFocus={() => setFocusedInput('password')}
                        onBlur={() => setFocusedInput(null)}
                        className="w-full bg-white/5 border-transparent focus:border-white/20 text-white placeholder:text-white/30 h-10 transition-all duration-300 pl-10 pr-10 focus:bg-white/10"
                      />

                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute right-3 cursor-pointer"
                        aria-label="Toggle password visibility"
                      >
                        {showPassword ? (
                          <Eye className="w-4 h-4 text-white/40 hover:text-white transition-colors duration-300" />
                        ) : (
                          <EyeClosed className="w-4 h-4 text-white/40 hover:text-white transition-colors duration-300" />
                        )}
                      </button>

                      {focusedInput === 'password' && (
                        <motion.div
                          layoutId="input-highlight"
                          className="absolute inset-0 bg-white/5 -z-10"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                        />
                      )}
                    </div>
                  </motion.div>
                </motion.div>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center space-x-2 text-xs text-white/60 hover:text-white/80 transition-colors duration-200">
                    <input
                      name="remember-me"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={() => setRememberMe((value) => !value)}
                      className="appearance-none h-4 w-4 rounded border border-white/20 bg-white/5 checked:bg-white checked:border-white focus:outline-none focus:ring-1 focus:ring-white/30 transition-all duration-200"
                    />
                    <span>Remember me</span>
                  </label>

                  <Link href="#" className="text-xs text-white/60 hover:text-white transition-colors duration-200">
                    Forgot password?
                  </Link>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={isLoading}
                  className="w-full relative group/button mt-5"
                >
                  <div className="absolute inset-0 bg-white/10 rounded-lg blur-lg opacity-0 group-hover/button:opacity-70 transition-opacity duration-300" />

                  <div className="relative overflow-hidden bg-white text-black font-medium h-10 rounded-lg transition-all duration-300 flex items-center justify-center">
                    <AnimatePresence mode="wait">
                      {isLoading ? (
                        <motion.div
                          key="loading"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center justify-center"
                        >
                          <div className="w-4 h-4 border-2 border-black/70 border-t-transparent rounded-full animate-spin" />
                        </motion.div>
                      ) : (
                        <motion.span
                          key="button-text"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center justify-center gap-1 text-sm font-medium"
                        >
                          {submitLabel}
                          <ArrowRight className="w-3 h-3 group-hover/button:translate-x-1 transition-transform duration-300" />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.button>

                <div className="relative mt-2 mb-5 flex items-center">
                  <div className="flex-grow border-t border-white/5" />
                  <span className="mx-3 text-xs text-white/40">or</span>
                  <div className="flex-grow border-t border-white/5" />
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => void onGoogleSubmit()}
                  disabled={isLoading}
                  className="w-full relative group/google"
                >
                  <div className="absolute inset-0 bg-white/5 rounded-lg blur opacity-0 group-hover/google:opacity-70 transition-opacity duration-300" />

                  <div className="relative overflow-hidden bg-white/5 text-white font-medium h-10 rounded-lg border border-white/10 hover:border-white/20 transition-all duration-300 flex items-center justify-center gap-2">
                    <Globe className="w-4 h-4 text-white/80 group-hover/google:text-white transition-colors duration-300" />
                    <span className="text-white/80 group-hover/google:text-white transition-colors text-xs">Continue with Google</span>
                  </div>
                </motion.button>

                <motion.p
                  className="text-center text-xs text-white/60 mt-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
                  <button
                    type="button"
                    onClick={() => onModeChange(mode === 'signin' ? 'signup' : 'signin')}
                    className="text-white hover:text-white/70 transition-colors duration-300 font-medium"
                  >
                    {mode === 'signin' ? 'Sign up' : 'Sign in'}
                  </button>
                </motion.p>
              </form>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
