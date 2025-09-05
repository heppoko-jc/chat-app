// hook/useAuth.ts

import { useEffect, useState } from "react";
import axios from "axios";

interface User {
  name: string;
  email: string;
  bio: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        setUser(null);
        return;
      }
      try {
        const res = await axios.get<User>("/api/auth/profile", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUser(res.data);
      } catch {
        // トークン無効／期限切れならクリアして null に
        localStorage.removeItem("token");
        localStorage.removeItem("userId");
        setUser(null);
      }
    };
    fetchUser();
  }, []);

  return user;
}