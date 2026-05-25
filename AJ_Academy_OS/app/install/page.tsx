import type { Metadata } from "next";
import { InstallLoginLink } from "@/components/pwa/InstallLoginLink";
import { InstallPageRedirect } from "@/components/pwa/InstallPageRedirect";
import { PWA_APP_NAME } from "@/lib/pwa/branding";

export const metadata: Metadata = {
  title: `Install ${PWA_APP_NAME}`,
  description: `Install ${PWA_APP_NAME} on your phone`,
};

export default function InstallPage() {
  return (
    <>
      <InstallPageRedirect />
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#eff6ff] to-white p-6">
        <div className="w-full max-w-md rounded-2xl border border-[#c9d8eb] bg-white p-6 shadow-lg">
          <h1 className="text-center text-xl font-semibold text-[#3d3428]">Install {PWA_APP_NAME}</h1>
          <p className="mt-2 text-center text-sm text-[#64748b]">
            Use this page once to add the app to your phone. After that, open from your home screen.
          </p>

          <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm text-[#334155]">
            <li>
              Use <strong>Chrome</strong> (not WhatsApp). URL must be{" "}
              <strong>aj-academy.vercel.app</strong>
            </li>
            <li>
              Tap <strong>⋮</strong> (top right) → <strong>Add to Home screen</strong> → <strong>Add</strong>
            </li>
            <li>
              Check your <strong>home screen</strong> for the BB icon (swipe left/right on home pages).
            </li>
            <li>
              Do <strong>not</strong> tap Install again if it keeps saying &quot;Installing…&quot;
            </li>
          </ol>

          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            If there is still no icon: Settings → Apps → Chrome → Storage → <strong>Clear cache</strong>,
            then try step 2 again. Sign in to <strong>Google Play</strong> and use Wi‑Fi.
          </p>

          <InstallLoginLink />
        </div>
      </div>
    </>
  );
}
