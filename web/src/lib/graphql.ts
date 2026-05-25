import { print, type DocumentNode } from "graphql";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/graphql";

export async function fetchGraphQL<T>(
    query: string | DocumentNode,
    variables?: Record<string, unknown>
): Promise<T> {
    const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: typeof query === "string" ? query : print(query), variables }),
        next: { revalidate: 3600 },
    });

    const { data } = await response.json();
    return data;
}
