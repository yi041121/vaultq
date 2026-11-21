import { redirect } from "next/navigation";

// The old demo landing page has been removed. The application entry point is
// the sign-in page, so every visitor to the site root is sent straight there.
export default function Home() {
  redirect("/login");
}
