// app/register/page.tsx

"use client";
import { useState } from "react";
import axios, { AxiosError } from "axios";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleRegister = async () => {
    try {
      const res = await axios.post("/api/auth/register", { name, email, password });
      alert(res.data.message);
    } catch (err: unknown) {
      const error = err as AxiosError<{ error: string}>;  
      alert(error.response?.data?.error || "Registration failed");
    }
  };

  return (
    <div className="p-5">
      <h1 className="text-xl mb-2">Register</h1>
      <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="border p-2 w-full mb-2" />
      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="border p-2 w-full mb-2" />
      <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="border p-2 w-full mb-2" />
      <button onClick={handleRegister} className="bg-blue-500 text-white p-2 w-full">Register</button>
    </div>
  );
}
