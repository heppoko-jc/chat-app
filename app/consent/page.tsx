// app/consent/page.tsx

"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Consent() {
  const [name, setName] = useState("");
  const [agreements, setAgreements] = useState({
    participation: false,
    interview: false,
    dataUsage: false,
    recording: null as boolean | null, // null=未選択, true=許可, false=拒否
  });
  const [textScrolledToBottom, setTextScrolledToBottom] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  // 既存ユーザーのチェック（同意済み && 名前入力済みならスキップ）
  useEffect(() => {
    const existingConsent = localStorage.getItem("experimentConsent");
    if (existingConsent) {
      const consentData = JSON.parse(existingConsent);
      if (consentData.consentGiven && consentData.participantName) {
        // 既に同意済み && 名前入力済み → ログインページへ
        router.replace("/login");
        return;
      }
      // 同意済みだが名前が未入力 → フォームの初期値として名前を設定
      if (consentData.participantName) {
        setName(consentData.participantName);
      }
      // 同意済みだが名前が未入力 → そのまま表示（名前入力を促す）
    }
  }, [router]);

  // テキスト版スクロール監視
  useEffect(() => {
    // 開発環境では即座に有効化（問題回避のため）
    if (process.env.NODE_ENV === "development") {
      console.log("Development mode: 同意項目を即座に有効化");
      setTimeout(() => setTextScrolledToBottom(true), 500);
      return;
    }

    // 少し待ってから要素を探す（Reactのレンダリング完了を待つ）
    const setupScrollDetection = () => {
      // スクロール可能な親要素を探す
      const scrollContainer = document.querySelector(".overflow-y-auto");

      if (!scrollContainer) {
        console.warn("スクロールコンテナが見つかりません");
        // フォールバック: 3秒後に有効化
        setTimeout(() => setTextScrolledToBottom(true), 3000);
        return;
      }

      const checkScroll = () => {
        const scrollTop = scrollContainer.scrollTop;
        const scrollHeight = scrollContainer.scrollHeight;
        const clientHeight = scrollContainer.clientHeight;

        console.log("Scroll check:", {
          scrollTop,
          scrollHeight,
          clientHeight,
          isAtBottom: scrollTop + clientHeight >= scrollHeight - 50,
        });

        // 最下部まで読んだかチェック（余裕を持って50px手前でOK）
        if (scrollTop + clientHeight >= scrollHeight - 50) {
          console.log("最下部まで到達しました");
          setTextScrolledToBottom(true);
          scrollContainer.removeEventListener("scroll", checkScroll);
        }
      };

      scrollContainer.addEventListener("scroll", checkScroll);

      // 初期チェック（既に最下部にいる場合）
      checkScroll();

      return () => {
        scrollContainer.removeEventListener("scroll", checkScroll);
      };
    };

    // DOM読み込み完了を待つ
    const timer = setTimeout(setupScrollDetection, 100);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  const handleAgreementChange = (key: string, value: boolean) => {
    setAgreements((prev) => ({ ...prev, [key]: value }));
  };

  const isFormValid = () => {
    return (
      name.trim() !== "" && // 名前が必須
      textScrolledToBottom &&
      agreements.participation &&
      agreements.interview &&
      agreements.dataUsage &&
      agreements.recording !== null // 録音は選択必須
    );
  };

  const handleSubmit = async () => {
    if (!isFormValid()) {
      if (!name.trim()) {
        alert("お名前を入力してください");
      } else if (!textScrolledToBottom) {
        alert("説明書を最後までスクロールしてお読みください");
      } else {
        alert("全ての必須項目にご同意いただく必要があります");
      }
      return;
    }

    setIsSubmitting(true);

    try {
      // 同意情報をlocalStorageに保存
      const consentData = {
        consentGiven: true,
        consentDate: new Date().toISOString(),
        participantName: name.trim(), // 名前も保存
        participation: agreements.participation,
        interview: agreements.interview,
        dataUsage: agreements.dataUsage,
        recordingConsent: agreements.recording,
      };

      localStorage.setItem("experimentConsent", JSON.stringify(consentData));

      // 登録ページに遷移
      router.push("/register");
    } catch (error) {
      console.error("同意情報の保存に失敗:", error);
      alert("エラーが発生しました。もう一度お試しください。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-gray-50 py-4 px-4 pb-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg overflow-hidden">
        {/* ヘッダー */}
        <div className="bg-blue-600 text-white p-6">
          <h1 className="text-2xl font-bold text-center">
            HICβ検証実験への参加同意書
          </h1>
        </div>

        {/* 研究紹介 */}
        <div className="bg-blue-50 p-4">
          <p className="text-sm text-gray-700 text-center">
            このアプリは慶應義塾大学メディアデザイン研究科城山拓海の修士研究の一環です。アプリを使った感想をぜひ教えてください。
          </p>
        </div>

        {/* PDF表示エリア */}
        <div className="p-6">
          {/* お名前入力欄 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              お名前 <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              placeholder="例：山田太郎"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={isSubmitting}
            />
            <p className="text-xs text-gray-500 mt-1">
              本実験でのご参加者名をご入力ください
            </p>
          </div>

          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">実験説明書</h2>
            <div className="border rounded-lg bg-white max-h-96 overflow-y-auto">
              <div className="p-6 prose prose-sm max-w-none">
                <div className="text-center mb-6">
                  <h3 className="text-lg font-bold mb-2">
                    Reducing The Initiation hurdle: Designing a Mutual-Liking
                    Matching chat Approach for Text-Based Communication
                  </h3>
                  <p className="text-sm text-gray-600 mb-1">
                    （会話イニシエーションの弊害を軽減する：テキストチャットにおける相思相愛マッチング手法の設計）
                  </p>
                  <p className="font-semibold text-blue-700">
                    第一回β版学内外検証実験説明書
                  </p>
                </div>

                <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-gray-700">
                    本実験は以下の目的で行うものです。以下の項目をお読みいただき、
                    実験協力に同意される場合は、同意書にご署名をお願い致します。
                  </p>
                </div>

                <div className="space-y-4">
                  <section>
                    <h4 className="font-semibold text-gray-800 mb-2">
                      実験の目的
                    </h4>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      本実験では、コミュニティのメンバーが相互認証型チャットサービスを利用する際の体験を調査します。各参加者の体験詳細を通じて、デジタルテキストコミュニケーションに関する知見を得ることを目的としています。
                    </p>
                  </section>

                  <section>
                    <h4 className="font-semibold text-gray-800 mb-2">実験者</h4>
                    <p className="text-sm text-gray-700">
                      慶應義塾大学大学院メディアデザイン研究科　修士２年　城山拓海（以下、城山）
                    </p>
                  </section>

                  <section>
                    <h4 className="font-semibold text-gray-800 mb-2">
                      実験参加者
                    </h4>
                    <ul className="text-sm text-gray-700 space-y-1">
                      <li>
                        • 慶應義塾大学大学院メディアデザイン研究科　学生約６０名
                      </li>
                      <li>• 上記参加者の関係者（学外）　約１４０名</li>
                    </ul>
                  </section>

                  <section>
                    <h4 className="font-semibold text-gray-800 mb-2">
                      実験方法
                    </h4>
                    <p className="text-sm text-gray-700 mb-2">
                      以下の手順に沿って実験を行います。
                    </p>
                    <ol className="text-sm text-gray-700 space-y-1 list-decimal list-inside">
                      <li>
                        実験の説明および同意書、インフォームドコンセントへの署名(5min)
                      </li>
                      <li>サービス体験前のインフォーマルインタビュー(20min)</li>
                      <li>サービス説明および利用準備(10min)</li>
                      <li>体験フェーズ(2-3week)</li>
                      <li>サービス体験後のインフォーマルインタビュー(40min)</li>
                    </ol>
                    <div className="mt-3 space-y-2 text-sm text-gray-700 leading-relaxed">
                      <p>
                        初めに実験内容の説明を行い、同意書および個人情報使用承諾書への署名をいただきます。その後、サービス体験前に既存サービス利用についてのインフォーマルインタビューを行います。その後、実際に新しく開発されたメッセージングサービスHappy
                        Ice
                        Creamウェブβ版（以下、HICβ）をご自身のデバイスに設定していただき、２～３週間体験していただきます。
                      </p>
                      <p>
                        実験全体の所要期間は２～３週間を予定しており、インタビュー中以外は参加者ご自身に自由にサービスを利用していただく予定です。インタビュー中に休憩が必要な場合は遠慮なくお知らせください。
                      </p>
                      <p className="font-medium text-blue-700">
                        また、サービスをご利用いただくにあたり、スマートフォンホーム画面へのショートカットの設定、端末内の見やすい位置への配置、および通知機能の有効化の3点を必須事項とさせていただきます。
                      </p>
                    </div>
                  </section>

                  <section>
                    <h4 className="font-semibold text-gray-800 mb-2">
                      個人情報とデータの取り扱い
                    </h4>
                    <div className="text-sm text-gray-700 leading-relaxed space-y-2">
                      <p>
                        本検証実験では個人情報およびその他データを取得します。（詳しくは別紙に記載）体験利用中は匿名化されたHICβログデータを取得し、体験利用前後のインタビュー時は既存サービスおよびHICβ利用情報を口頭でお伺いします。
                      </p>
                      <p className="font-medium text-green-700">
                        体験利用時に記録されるログデータには個人情報が含まれますが、チャットの内容や個人名は全て暗号化（AES-256ブロック暗号、TLS
                        1.2/1.3）されるため、城山を含めその他全ての他者がそのデータを見ることはできません。
                      </p>
                      <p>
                        取得したデータや個人情報は、匿名化（個人が特定できない状態）した上で、研究目的のみに使用され、それ以外の目的で利用されることは一切ありません。
                      </p>
                    </div>
                  </section>

                  <section>
                    <h4 className="font-semibold text-gray-800 mb-2">連絡先</h4>
                    <div className="text-sm text-gray-700 space-y-2">
                      <div>
                        <p className="font-medium">実験者</p>
                        <p>
                          慶應義塾大学大学院メディアデザイン研究科 修士課程２年
                          城山 拓海
                        </p>
                        <p>連絡先電話番号：080-2599-8222</p>
                        <p>Email: tacomeat@keio.jp, tacomeat@kmd.keio.ac.jp</p>
                      </div>
                      <div>
                        <p className="font-medium">研究責任者</p>
                        <p>
                          慶應義塾大学大学院メディアデザイン研究科教授 岸 博幸
                        </p>
                        <p>Email: hkishi@policywatch.jp</p>
                      </div>
                    </div>
                  </section>

                  <section className="border-t pt-4">
                    <h4 className="font-semibold text-gray-800 mb-2">
                      取得されるデータ詳細
                    </h4>
                    <div className="text-sm text-gray-700 space-y-3">
                      <div>
                        <p className="font-medium mb-1">
                          体験利用前後インタビュー
                        </p>
                        <ul className="space-y-1 text-xs">
                          <li>• LINE利用データ（主観的評価）</li>
                          <li>• HICβ利用データ（主観的評価）</li>
                          <li>• 利用感想およびインタビューの録音</li>
                        </ul>
                      </div>
                      <div>
                        <p className="font-medium mb-1">体験利用時ログデータ</p>
                        <ul className="space-y-1 text-xs">
                          <li>• 会話人数、メッセージ送信データ</li>
                          <li>• アプリ利用ログデータ</li>
                          <li>• その他匿名化された利用ログデータ</li>
                        </ul>
                        <p className="text-xs text-green-600 mt-2 font-medium">
                          ※ チャット内容・個人名は暗号化され、実験者も閲覧不可
                        </p>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>
            <div className="mt-2">
              {!textScrolledToBottom ? (
                <div className="text-sm text-orange-600">
                  <p>📖 説明書を最後までお読みください</p>
                  <p className="text-xs text-gray-500 mt-1">
                    説明書を最下部までスクロールすると同意項目が有効になります。
                  </p>
                </div>
              ) : (
                <p className="text-sm text-green-600">
                  ✅ 説明書の確認完了。同意項目を選択できます。
                </p>
              )}
            </div>
          </div>

          {/* 同意項目 */}
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">同意項目</h2>

            {/* 1. 参加について */}
            <div className="border rounded-lg bg-gray-50 overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  handleAgreementChange(
                    "participation",
                    !agreements.participation
                  )
                }
                disabled={!textScrolledToBottom}
                className={`w-full p-4 text-left ${
                  agreements.participation
                    ? "bg-green-50 border-green-200"
                    : "bg-gray-50 hover:bg-gray-100"
                } ${
                  !textScrolledToBottom
                    ? "opacity-50 cursor-not-allowed"
                    : "cursor-pointer"
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div
                    className={`flex-shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center ${
                      agreements.participation
                        ? "bg-green-500 border-green-500 text-white"
                        : "border-gray-300 bg-white"
                    }`}
                  >
                    {agreements.participation && (
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                  <div className="text-sm">
                    <span className="font-medium text-red-600">【必須】</span>
                    <span className="font-medium">参加について</span>
                    <p className="mt-2 text-gray-700 leading-relaxed">
                      私は、「Reducing The Initiation hurdle: Designing a
                      Mutual-Liking Matching chat Approach for Text-Based
                      Communication（会話イニシエーションの弊害を軽減する：テキストチャットにおける相思相愛マッチング手法の設計）」第一回β版学内検証実験の説明書について説明文書を用いて説明を受け、内容を理解し、この実験に参加・協力することに同意します。
                    </p>
                  </div>
                </div>
              </button>
            </div>

            {/* 2. 回答について */}
            <div className="border rounded-lg bg-gray-50 overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  handleAgreementChange("interview", !agreements.interview)
                }
                disabled={!textScrolledToBottom}
                className={`w-full p-4 text-left ${
                  agreements.interview
                    ? "bg-green-50 border-green-200"
                    : "bg-gray-50 hover:bg-gray-100"
                } ${
                  !textScrolledToBottom
                    ? "opacity-50 cursor-not-allowed"
                    : "cursor-pointer"
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div
                    className={`flex-shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center ${
                      agreements.interview
                        ? "bg-green-500 border-green-500 text-white"
                        : "border-gray-300 bg-white"
                    }`}
                  >
                    {agreements.interview && (
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                  <div className="text-sm">
                    <span className="font-medium text-red-600">【必須】</span>
                    <span className="font-medium">回答について</span>
                    <p className="mt-2 text-gray-700 leading-relaxed">
                      私は、本実験のインタビューにおいて、誠実に回答し、回答できない質問がある場合にはその旨を伝えることに同意します。
                    </p>
                  </div>
                </div>
              </button>
            </div>

            {/* 3. データの使用について */}
            <div className="border rounded-lg bg-gray-50 overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  handleAgreementChange("dataUsage", !agreements.dataUsage)
                }
                disabled={!textScrolledToBottom}
                className={`w-full p-4 text-left ${
                  agreements.dataUsage
                    ? "bg-green-50 border-green-200"
                    : "bg-gray-50 hover:bg-gray-100"
                } ${
                  !textScrolledToBottom
                    ? "opacity-50 cursor-not-allowed"
                    : "cursor-pointer"
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div
                    className={`flex-shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center ${
                      agreements.dataUsage
                        ? "bg-green-500 border-green-500 text-white"
                        : "border-gray-300 bg-white"
                    }`}
                  >
                    {agreements.dataUsage && (
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                  <div className="text-sm">
                    <span className="font-medium text-red-600">【必須】</span>
                    <span className="font-medium">データの使用について</span>
                    <p className="mt-2 text-gray-700 leading-relaxed">
                      私は、取得したデータを研究目的（論文・学会発表・学内報告書を含む）で使用することを許可します。
                    </p>
                  </div>
                </div>
              </button>
            </div>

            {/* 4. インタビューの録音について */}
            <div className="border rounded-lg bg-yellow-50 overflow-hidden">
              <div className="p-4">
                <div className="text-sm mb-4">
                  <span className="font-medium text-orange-600">【選択】</span>
                  <span className="font-medium">
                    インタビューの録音について
                  </span>
                  <p className="mt-2 text-gray-700 leading-relaxed">
                    研究を正確に行い、深く感情を分析するため、できれば録音を許可していただきたく思います。
                    ただし、録音を拒否されても実験には参加いただけます。
                  </p>
                </div>
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => handleAgreementChange("recording", true)}
                    disabled={!textScrolledToBottom}
                    className={`w-full p-3 rounded-lg border-2 text-left ${
                      agreements.recording === true
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : "bg-white border-gray-200 hover:border-gray-300"
                    } ${
                      !textScrolledToBottom
                        ? "opacity-50 cursor-not-allowed"
                        : "cursor-pointer"
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          agreements.recording === true
                            ? "border-blue-500 bg-blue-500"
                            : "border-gray-300 bg-white"
                        }`}
                      >
                        {agreements.recording === true && (
                          <div className="w-2 h-2 rounded-full bg-white"></div>
                        )}
                      </div>
                      <span className="font-medium">許可します</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAgreementChange("recording", false)}
                    disabled={!textScrolledToBottom}
                    className={`w-full p-3 rounded-lg border-2 text-left ${
                      agreements.recording === false
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : "bg-white border-gray-200 hover:border-gray-300"
                    } ${
                      !textScrolledToBottom
                        ? "opacity-50 cursor-not-allowed"
                        : "cursor-pointer"
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          agreements.recording === false
                            ? "border-blue-500 bg-blue-500"
                            : "border-gray-300 bg-white"
                        }`}
                      >
                        {agreements.recording === false && (
                          <div className="w-2 h-2 rounded-full bg-white"></div>
                        )}
                      </div>
                      <span className="font-medium">許可しません</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 同意ボタン */}
          <div className="mt-8 pb-6 text-center">
            <button
              onClick={handleSubmit}
              disabled={!isFormValid() || isSubmitting}
              className={`px-8 py-3 rounded-lg font-semibold text-white transition-colors ${
                isFormValid() && !isSubmitting
                  ? "bg-blue-600 hover:bg-blue-700 cursor-pointer"
                  : "bg-gray-400 cursor-not-allowed"
              }`}
            >
              {isSubmitting ? "処理中..." : "次へ"}
            </button>

            {!isFormValid() && (
              <div className="text-sm text-gray-600 mt-2 space-y-1">
                {!name.trim() && <p>• お名前を入力してください</p>}
                {!textScrolledToBottom && (
                  <p>• 説明書を最後までスクロールしてお読みください</p>
                )}
                {textScrolledToBottom && !agreements.participation && (
                  <p>• 「参加について」にご同意ください</p>
                )}
                {textScrolledToBottom && !agreements.interview && (
                  <p>• 「回答について」にご同意ください</p>
                )}
                {textScrolledToBottom && !agreements.dataUsage && (
                  <p>• 「データの使用について」にご同意ください</p>
                )}
                {textScrolledToBottom && agreements.recording === null && (
                  <p>• 「録音について」の選択をしてください</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
