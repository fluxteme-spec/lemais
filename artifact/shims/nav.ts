import { currentQuery } from "../router";
export function searchParams(): URLSearchParams {
  return currentQuery();
}
