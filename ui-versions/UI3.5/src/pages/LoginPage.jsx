import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import AuthLayout from './AuthLayout';
import { Field, Notice } from '../components/ui/Controls';

export default function LoginPage({ onSwitchToRegister }) {
  const { login, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Enter both your email and your password.');
      return;
    }

    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err.message || 'Sign-in failed. Check your email and password.');
    }
  };

  const fillDemoAccount = () => {
    setEmail('haziq@example.com');
    setPassword('password123');
    setError('');
  };

  return (
    <AuthLayout
      headline="See where your ringgit goes"
      lead="Your bank statement, your loans, your life goals and your insurance risk, read together in one place."
    >
      <h2 className="t-section">Sign in</h2>
      <Notice tone="danger" show={Boolean(error)} className="mt-3">
        {error}
      </Notice>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <Field label="Email">
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" required />
        </Field>
        <Field label="Password">
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <button type="submit" disabled={loading} className="btn btn-primary w-full">
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <button type="button" onClick={fillDemoAccount} className="btn btn-quiet w-full mt-2.5">
        Use the demo account
      </button>

      <p className="t-note mt-5 text-center">
        New here?{' '}
        <button type="button" onClick={onSwitchToRegister} className="link">
          Create an account
        </button>
      </p>
    </AuthLayout>
  );
}
