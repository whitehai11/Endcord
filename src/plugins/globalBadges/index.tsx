/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { addProfileBadge, BadgePosition, ProfileBadge, removeProfileBadge } from "@api/Badges";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { Toasts } from "@webpack/common";

import { settings } from "./settings";

const API_URL = "https://badges.equicord.org/users";
const REFRESH_INTERVAL = 30 * 60 * 1000;

const serviceNames: Record<string, string> = {
    aero: "Aero",
    aliucord: "Aliucord",
    badgevault: "BadgeVault",
    betterdiscord: "BetterDiscord",
    bunny: "Bunny",
    enmity: "Enmity",
    equicord: "Equicord",
    goosemod: "GooseMod",
    nekocord: "Nekocord",
    paicord: "Paicord",
    raincord: "Raincord",
    record: "ReCord",
    replugged: "Replugged",
    revenge: "Revenge",
    reviewdb: "ReviewDB",
    velocity: "Velocity",
    vencord: "Vencord",
    vendroidenhanced: "Vendroid Enhanced",
};

interface ApiBadge {
    badge: string;
    mod?: string;
    tooltip: string;
}

interface ApiResponse {
    users?: Record<string, ApiBadge[]>;
}

let badgesByUser: Record<string, ApiBadge[]> = {};
let refreshTimer: ReturnType<typeof setInterval> | undefined;

async function loadBadges() {
    const response = await fetch(API_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Badge API returned ${response.status}`);

    const data = await response.json() as ApiResponse;
    if (!data.users || typeof data.users !== "object") throw new Error("Badge API returned an invalid users payload");

    badgesByUser = Object.fromEntries(
        Object.entries(data.users).map(([userId, badges]) => [
            userId,
            badges.filter(badge => settings.store.includeOfficialDiscordBadges || badge.mod !== "discord"),
        ])
    );
}

const globalBadgeLoader: ProfileBadge = {
    id: "endcord_global_badges",
    getBadges({ userId }) {
        return badgesByUser[userId]?.map((badge, index) => {
            const source = badge.mod && serviceNames[badge.mod] || badge.mod;
            const description = settings.store.showServiceName && source
                ? `${badge.tooltip} — ${source}`
                : badge.tooltip;

            return {
                id: `endcord_global_badge_${userId}_${index}`,
                iconSrc: badge.badge,
                description,
                position: BadgePosition.START,
                props: {
                    style: {
                        borderRadius: "50%",
                        transform: "scale(0.9)",
                    },
                },
            } satisfies ProfileBadge;
        }) ?? [];
    },
};

export default definePlugin({
    name: "GlobalBadges",
    description: "Shows all custom badges assigned by the Equicord global badge API.",
    tags: ["Appearance"],
    authors: [Devs.HypedDomi, { name: "Wolfie", id: 0n }, Devs.thororen],
    dependencies: ["BadgeAPI"],
    settings,
    async start() {
        addProfileBadge(globalBadgeLoader);

        try {
            await loadBadges();
        } catch (error) {
            console.error("[GlobalBadges] Could not load badges:", error);
        }

        clearInterval(refreshTimer);
        refreshTimer = setInterval(() => void loadBadges().catch(error => {
            console.error("[GlobalBadges] Could not refresh badges:", error);
        }), REFRESH_INTERVAL);
    },
    stop() {
        clearInterval(refreshTimer);
        refreshTimer = undefined;
        removeProfileBadge(globalBadgeLoader);
        badgesByUser = {};
    },
    toolboxActions: {
        async "Refetch Global Badges"() {
            try {
                await loadBadges();
                Toasts.show({
                    id: Toasts.genId(),
                    message: "Global badges refreshed.",
                    type: Toasts.Type.SUCCESS,
                });
            } catch (error) {
                console.error("[GlobalBadges] Could not refresh badges:", error);
                Toasts.show({
                    id: Toasts.genId(),
                    message: "Could not refresh global badges. Check your connection and try again.",
                    type: Toasts.Type.FAILURE,
                });
            }
        },
    },
});
