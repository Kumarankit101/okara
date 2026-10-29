import { permanentRedirect } from "next/navigation";

export default function LegacyMemoryPage() {
  permanentRedirect("/preferences");
}
