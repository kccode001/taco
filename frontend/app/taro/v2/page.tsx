import { redirect } from "next/navigation";

/** v2 index → dashboard (the management centerpiece). */
export default function V2Index() {
  redirect("/taro/v2/dashboard");
}
