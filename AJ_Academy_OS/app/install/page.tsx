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
      <div className="aj-auth-canvas">
        <div className="aj-auth-card w-full max-w-md border border-[#e8dcc8] bg-white/95 p-6 sm:p-7">
          <p className="aj-page-kicker text-center">Mobile install</p>
          <h1 className="mt-2 text-center text-xl font-semibold tracking-tight text-[#3d3428] sm:text-2xl">
            Install {PWA_APP_NAME}
          </h1>
          <p className="mt-2 text-center text-sm leading-relaxed text-[#6b5d4d]">
            Add the app to your phone once, then open it from your home screen.
          </p>

          <ol className="mt-5 list-decimal space-y-2.5 pl-5 text-sm leading-relaxed text-[#3d3428]">
            <li>
              Use <strong>Chrome</strong> (not WhatsApp). URL must be{" "}
              <strong>aj-academy.vercel.app</strong>
            </li>
            <li>
              Tap <strong>⋮</strong> (top right) → <strong>Add to Home screen</strong> → <strong>Add</strong>
            </li>
            <li>
              Check your <strong>home screen</strong> for the AJ Academy icon (swipe left/right on home pages).
            </li>
            <li>
              Do <strong>not</strong> tap Install again if it keeps saying &quot;Installing…&quot;
            </li>
          </ol>

          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-950">
            If there is still no icon: Settings → Apps → Chrome → Storage → <strong>Clear cache</strong>,
            then try step 2 again. Sign in to <strong>Google Play</strong> and use Wi‑Fi.
          </p>

          <InstallLoginLink />
        </div>
      </div>
    </>
  );
}
