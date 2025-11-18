// app/profile/page.tsx

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import FixedTabBar from "../components/FixedTabBar";
import { unsubscribePush } from "@/app/lib/push";
import { useLanguage } from "../contexts/LanguageContext";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w.charAt(0))
    .join("")
    .toUpperCase();
}

function getBgColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const h = hash % 360;
  return `hsl(${h}, 70%, 60%)`;
}

interface User {
  name: string;
  nameEn?: string | null;
  nameJa?: string | null;
  nameOther?: string | null;
  email: string;
  bio: string;
}

export default function Profile() {
  const router = useRouter();
  const { t } = useLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [nameJa, setNameJa] = useState("");
  const [nameOther, setNameOther] = useState("");
  const [bio, setBio] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [showSavedPopup, setShowSavedPopup] = useState(false);
  const [showLogoutPopup, setShowLogoutPopup] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordChangeMessage, setPasswordChangeMessage] = useState("");

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/login");
        return;
      }
      try {
        const res = await axios.get("/api/auth/profile", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUser(res.data);
        setName(res.data.name);
        setNameEn(res.data.nameEn || "");
        setNameJa(res.data.nameJa || "");
        setNameOther(res.data.nameOther || "");
        setBio(res.data.bio || "");
      } catch {
        // 期限切れ or 無効トークンならクリアしてログイン画面へ
        localStorage.removeItem("token");
        localStorage.removeItem("userId");
        router.push("/login");
      }
    };
    fetchUser();
  }, [router]);

  const handleUpdateProfile = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      alert(t("profile.loginRequired"));
      return;
    }
    try {
      const res = await axios.put(
        "/api/auth/profile",
        {
          name,
          nameEn: nameEn.trim() || null,
          nameJa: nameJa.trim() || null,
          nameOther: nameOther.trim() || null,
          bio,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setUser(res.data);
      setIsEditing(false);
      setShowSavedPopup(true);
      setTimeout(() => setShowSavedPopup(false), 3000);
    } catch {
      alert(t("profile.updateFailed"));
    }
  };

  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword) {
      setPasswordChangeMessage(t("profile.passwordMismatch"));
      return;
    }

    if (newPassword.length < 6) {
      setPasswordChangeMessage(t("profile.passwordTooShort"));
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      alert(t("profile.loginRequired"));
      return;
    }

    try {
      await axios.put(
        "/api/auth/change-password",
        { currentPassword, newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setPasswordChangeMessage(t("profile.passwordChanged"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setTimeout(() => {
        setShowPasswordChange(false);
        setPasswordChangeMessage("");
      }, 3000);
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { error?: string } } }).response?.data
          ?.error || t("profile.passwordChangeFailed");
      setPasswordChangeMessage(message);
    }
  };

  const handleLogout = async () => {
    try {
      // プッシュ購読解除
      await unsubscribePush();
    } catch (e) {
      console.error("プッシュ解除エラー:", e);
    }
    // ローカルストレージ・リダイレクト
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    router.push("/login");
  };

  if (!user) return <p className="p-5">{t("profile.loading")}</p>;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-orange-50 via-white to-orange-100">
      <div className="flex-1 overflow-y-auto pb-24 max-w-md mx-auto w-full px-4">
        <div className="flex flex-col items-center mt-8 mb-6">
          <div
            className="w-32 h-32 rounded-full flex items-center justify-center text-white text-5xl font-extrabold shadow-lg border-4 border-white mb-3"
            style={{ backgroundColor: getBgColor(user.name) }}
          >
            {getInitials(user.name)}
          </div>
          <h2 className="text-2xl font-extrabold text-gray-800 mb-1 tracking-tight">
            {user.name}
          </h2>
          <p className="text-gray-500 text-sm mb-2">{user.email}</p>
        </div>
        {showSavedPopup && (
          <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-2xl shadow-lg z-50 font-bold text-base animate-fade-in">
            {t("profile.saved")}
          </div>
        )}
        <div className="bg-white/90 rounded-2xl shadow-xl p-6 mb-6 flex flex-col gap-4">
          {isEditing ? (
            <>
              <div>
                  <label className="block mb-1 font-semibold text-gray-700">
                  {t("profile.name")}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="border border-orange-200 p-2 w-full rounded-lg focus:ring-2 focus:ring-orange-200 outline-none text-lg"
                />
              </div>
              <div>
                  <label className="block mb-1 font-semibold text-gray-700">
                  {t("profile.bio")}
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="border border-orange-200 p-2 w-full h-24 rounded-lg focus:ring-2 focus:ring-orange-200 outline-none text-base"
                />
              </div>
              <div className="border-t border-gray-200 pt-4 mt-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3">
                  {t("profile.searchNames")}
                </p>
                <div className="space-y-3">
                  <div>
                      <label className="block mb-1 font-semibold text-gray-700 text-sm">
                      {t("profile.englishName")}
                    </label>
                    <input
                      type="text"
                      value={nameEn}
                      onChange={(e) => setNameEn(e.target.value)}
                      placeholder={t("profile.nameEnExample")}
                      className="border border-orange-200 p-2 w-full rounded-lg focus:ring-2 focus:ring-orange-200 outline-none text-base"
                    />
                  </div>
                  <div>
                      <label className="block mb-1 font-semibold text-gray-700 text-sm">
                      {t("profile.japaneseName")}
                    </label>
                    <input
                      type="text"
                      value={nameJa}
                      onChange={(e) => setNameJa(e.target.value)}
                      placeholder={t("profile.nameJaExample")}
                      className="border border-orange-200 p-2 w-full rounded-lg focus:ring-2 focus:ring-orange-200 outline-none text-base"
                    />
                  </div>
                  <div>
                      <label className="block mb-1 font-semibold text-gray-700 text-sm">
                      {t("profile.otherName")}
                    </label>
                    <input
                      type="text"
                      value={nameOther}
                      onChange={(e) => setNameOther(e.target.value)}
                      placeholder={t("profile.nameOtherExample")}
                      className="border border-orange-200 p-2 w-full rounded-lg focus:ring-2 focus:ring-orange-200 outline-none text-base"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-center gap-4 mt-4">
                <button
                  onClick={handleUpdateProfile}
                  className="bg-gradient-to-r from-orange-400 to-orange-500 text-white px-8 py-2 rounded-full shadow font-bold hover:from-orange-500 hover:to-orange-600 transition"
                >
                  {t("profile.save")}
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="bg-gray-300 text-gray-700 px-8 py-2 rounded-full shadow font-bold hover:bg-gray-400 transition"
                >
                  {t("profile.cancel")}
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <p className="text-gray-700 text-base text-center min-h-[2.5rem]">
                {user.bio || t("profile.bioNotSet")}
              </p>
              <button
                onClick={() => setIsEditing(true)}
                className="bg-gradient-to-r from-orange-400 to-orange-500 text-white px-8 py-2 rounded-full shadow font-bold hover:from-orange-500 hover:to-orange-600 transition mt-2"
              >
                {t("profile.edit")}
              </button>
              <button
                onClick={() => setShowPasswordChange(true)}
                className="bg-blue-500 text-white px-8 py-2 rounded-full shadow font-bold hover:bg-blue-600 transition mt-2"
              >
                パスワード変更
              </button>
              <button
                onClick={() => setShowLogoutPopup(true)}
                className="bg-red-500 text-white px-8 py-2 rounded-full shadow font-bold hover:bg-red-600 transition mt-1"
              >
                {t("profile.logout")}
              </button>
            </div>
          )}
        </div>
        {showPasswordChange && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
            <div className="bg-white p-6 rounded-2xl shadow-2xl w-11/12 max-w-sm">
              <h3 className="text-lg font-bold mb-4 text-center">
                {t("profile.changePassword")}
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block mb-1 font-semibold text-gray-700">
                    {t("profile.currentPassword")}
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="border border-orange-200 p-2 w-full rounded-lg focus:ring-2 focus:ring-orange-200 outline-none"
                    placeholder={t("profile.currentPasswordPlaceholder")}
                  />
                </div>

                <div>
                  <label className="block mb-1 font-semibold text-gray-700">
                    {t("profile.newPassword")}
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="border border-orange-200 p-2 w-full rounded-lg focus:ring-2 focus:ring-orange-200 outline-none"
                    placeholder={t("profile.newPasswordPlaceholder")}
                  />
                </div>

                <div>
                  <label className="block mb-1 font-semibold text-gray-700">
                    {t("profile.confirmPassword")}
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="border border-orange-200 p-2 w-full rounded-lg focus:ring-2 focus:ring-orange-200 outline-none"
                    placeholder={t("profile.confirmPasswordPlaceholder")}
                  />
                </div>

                {passwordChangeMessage && (
                  <div
                    className={`text-center text-sm font-medium ${
                      passwordChangeMessage.includes(t("profile.passwordChanged"))
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {passwordChangeMessage}
                  </div>
                )}
              </div>

              <div className="flex justify-center gap-3 mt-6">
                <button
                  onClick={handlePasswordChange}
                  className="bg-blue-500 text-white px-8 py-2 rounded-full shadow font-bold hover:bg-blue-600 transition"
                >
                  {t("profile.change")}
                </button>
                <button
                  onClick={() => {
                    setShowPasswordChange(false);
                    setPasswordChangeMessage("");
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                  }}
                  className="bg-gray-300 text-gray-700 px-8 py-2 rounded-full shadow font-bold hover:bg-gray-400 transition"
                >
                  {t("profile.cancel")}
                </button>
              </div>
            </div>
          </div>
        )}

        {showLogoutPopup && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
            <div className="bg-white p-6 rounded-2xl shadow-2xl w-11/12 max-w-sm">
              <h3 className="text-lg font-bold mb-2 text-center">
                {t("profile.logoutConfirm")}
              </h3>
              <p className="mb-4 text-center text-gray-700">
                {t("profile.logoutConfirmMessage")}
              </p>
              <div className="flex justify-center gap-3 mt-2">
                <button
                  onClick={handleLogout}
                  className="bg-red-500 text-white px-8 py-2 rounded-full shadow font-bold hover:bg-red-600 transition"
                >
                  {t("profile.logout")}
                </button>
                <button
                  onClick={() => setShowLogoutPopup(false)}
                  className="bg-gray-300 text-gray-700 px-8 py-2 rounded-full shadow font-bold hover:bg-gray-400 transition"
                >
                  {t("profile.cancel")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <FixedTabBar />
    </div>
  );
}
