import { PitStopExplorer } from "@/components/PitStopExplorer";
import { LapTimeChart } from "@/components/LapTimeChart";
import { Contact } from "@/components/Contact";
import { fetchGraphQL } from "@/lib/graphql";
import { SEASONS_QUERY } from "@/lib/queries";
import type { Season } from "@/lib/types";

export default async function Page() {
    const data = await fetchGraphQL<{ seasons: Season[] }>(SEASONS_QUERY);

    return (
        <main className="space-y-16">
            <section>
                <PitStopExplorer initialSeasons={data.seasons} />
            </section>
            <section>
                <LapTimeChart />
            </section>
            <Contact />
        </main>
    );
}