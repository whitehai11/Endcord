/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    includeOfficialDiscordBadges: {
        type: OptionType.BOOLEAN,
        displayName: "Include official Discord badges",
        description: "Also render official badges returned by the global badge API. They may duplicate Discord's own badges.",
        default: false,
    },
    showServiceName: {
        type: OptionType.BOOLEAN,
        displayName: "Show badge source",
        description: "Append the client or service that provided a custom badge to its tooltip.",
        default: true,
    },
});
