import { createElement } from "react";
import Link from "next/link";

/**
 * Render navigation as a Next.js Link with the destination in its href.
 *
 * @bad Do not use a native button whose click handler calls router.push for navigation.
 * @bad Do not hide a navigation destination exclusively inside an imperative event handler.
 */
export const checkoutLink = createElement(Link, { href: "/checkout" }, "Go to checkout");
