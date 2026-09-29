/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { addProfileBadge, BadgePosition, ProfileBadge, removeProfileBadge } from "@api/Badges";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Flex } from "@components/Flex";
import { copyWithToast } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import { User, UserProfile } from "@vencord/discord-types";
import { Forms, React, TextInput, Toasts, UserProfileStore, UserStore } from "@webpack/common";
import virtualMerge from "virtual-merge";

type Tab = "home" | "profile" | "focus" | "voice" | "spaces" | "templates" | "privacy";
type BadgeId = "staff" | "developer" | "supporter" | "verified" | "early";

interface LocalProfile {
    id: string;
    name: string;
    enabled: boolean;
    username: string;
    displayName: string;
    bio: string;
    accent: string;
    badges: BadgeId[];
    focusMode: boolean;
    voiceSceneId: string;
}

interface VoiceScene {
    id: string;
    name: string;
    inputVolume: number;
    outputVolume: number;
    pushToTalk: boolean;
}

interface ServerSpace {
    id: string;
    guildId: string;
    name: string;
    accent: string;
    muted: boolean;
}

interface MessageTemplate {
    id: string;
    name: string;
    shortcut: string;
    content: string;
}

interface EndcordData {
    activeProfileId: string;
    profiles: LocalProfile[];
    voiceScenes: VoiceScene[];
    serverSpaces: ServerSpace[];
    messageTemplates: MessageTemplate[];
    focus: {
        enabled: boolean;
        guildIds: string;
        includeMentionsOnly: boolean;
    };
}

const BADGES: Record<BadgeId, { label: string; glyph: string; color: string; }> = {
    staff: { label: "Endcord Staff", glyph: "✦", color: "#f0b232" },
    developer: { label: "Endcord Developer", glyph: "</>", color: "#5865f2" },
    supporter: { label: "Endcord Supporter", glyph: "♥", color: "#eb459e" },
    verified: { label: "Endcord Verified", glyph: "✓", color: "#23a559" },
    early: { label: "Endcord Early Supporter", glyph: "★", color: "#00a8fc" },
};

function id(prefix: string) {
    return `${prefix}-${crypto.randomUUID()}`;
}

function createDefaultData(): EndcordData {
    return {
        activeProfileId: "default",
        profiles: [
            {
                id: "default",
                name: "Default",
                enabled: true,
                username: "",
                displayName: "",
                bio: "",
                accent: "#5865f2",
                badges: [],
                focusMode: false,
                voiceSceneId: "gaming",
            },
            {
                id: "focus",
                name: "Focus",
                enabled: true,
                username: "",
                displayName: "",
                bio: "",
                accent: "#57f287",
                badges: ["verified"],
                focusMode: true,
                voiceSceneId: "focus",
            },
            {
                id: "streaming",
                name: "Streaming",
                enabled: true,
                username: "",
                displayName: "",
                bio: "",
                accent: "#eb459e",
                badges: ["developer"],
                focusMode: false,
                voiceSceneId: "streaming",
            }
        ],
        voiceScenes: [
            { id: "gaming", name: "Gaming", inputVolume: 100, outputVolume: 100, pushToTalk: false },
            { id: "focus", name: "Focus", inputVolume: 75, outputVolume: 45, pushToTalk: true },
            { id: "streaming", name: "Streaming", inputVolume: 110, outputVolume: 85, pushToTalk: false },
        ],
        serverSpaces: [],
        messageTemplates: [
            { id: "brb", name: "Be right back", shortcut: "brb", content: "I will be right back." },
            { id: "thanks", name: "Thanks", shortcut: "thanks", content: "Thank you!" },
        ],
        focus: { enabled: false, guildIds: "", includeMentionsOnly: true },
    };
}

const settings = definePluginSettings({
    controlCenter: {
        type: OptionType.COMPONENT,
        component: EndcordControlCenter,
    }
}).withPrivateSettings<{ data?: EndcordData; }>();

function data(): EndcordData {
    return settings.store.data ?? (settings.store.data = createDefaultData());
}

function activeProfile() {
    const state = data();
    return state.profiles.find(profile => profile.id === state.activeProfileId) ?? state.profiles[0];
}

function updateData(mutator: (state: EndcordData) => void) {
    const next = structuredClone(data());
    mutator(next);
    settings.store.data = next;
    applyActiveProfile();
}

function notify(message: string) {
    Toasts.show({
        id: Toasts.genId(),
        message,
        type: Toasts.Type.SUCCESS
    });
}

function refreshUserStore() {
    (UserStore as any).emitChange?.();
    (UserProfileStore as any).emitChange?.();
}

function applyActiveProfile() {
    const profile = activeProfile();
    document.documentElement.style.setProperty("--endcord-accent", profile.accent || "#5865f2");
    document.documentElement.dataset.endcordProfile = profile.id;
    refreshUserStore();
}

function getLocalUser(user: User | undefined) {
    const profile = activeProfile();
    const currentUser = originalGetCurrentUser?.() ?? UserStore.getCurrentUser();
    if (!user || !profile?.enabled || user.id !== currentUser?.id) return user;

    return virtualMerge(user, {
        username: profile.username.trim() || user.username,
        globalName: profile.displayName.trim() || user.globalName,
    });
}

function getLocalUserProfile(profile: UserProfile | undefined) {
    const localProfile = activeProfile();
    const currentUser = originalGetCurrentUser?.() ?? UserStore.getCurrentUser();
    if (!profile || !localProfile?.enabled || profile.userId !== currentUser?.id || !localProfile.bio.trim()) return profile;

    return virtualMerge(profile, { bio: localProfile.bio.trim() });
}

let originalGetUser: ((id: string) => User | undefined) | undefined;
let originalGetCurrentUser: (() => User) | undefined;
let originalGetUserProfile: ((userId: string) => UserProfile | undefined) | undefined;

function installLocalProfileOverlay() {
    if (!originalGetUser) {
        originalGetUser = UserStore.getUser.bind(UserStore);
        (UserStore as any).getUser = (userId: string) => getLocalUser(originalGetUser!(userId));
    }

    if (!originalGetCurrentUser) {
        originalGetCurrentUser = UserStore.getCurrentUser.bind(UserStore);
        (UserStore as any).getCurrentUser = () => getLocalUser(originalGetCurrentUser!());
    }

    if (!originalGetUserProfile) {
        originalGetUserProfile = UserProfileStore.getUserProfile.bind(UserProfileStore);
        (UserProfileStore as any).getUserProfile = (userId: string) => getLocalUserProfile(originalGetUserProfile!(userId));
    }

    applyActiveProfile();
}

function uninstallLocalProfileOverlay() {
    if (originalGetUser) (UserStore as any).getUser = originalGetUser;
    if (originalGetCurrentUser) (UserStore as any).getCurrentUser = originalGetCurrentUser;
    if (originalGetUserProfile) (UserProfileStore as any).getUserProfile = originalGetUserProfile;
    originalGetUser = undefined;
    originalGetCurrentUser = undefined;
    originalGetUserProfile = undefined;
    document.documentElement.style.removeProperty("--endcord-accent");
    delete document.documentElement.dataset.endcordProfile;
    refreshUserStore();
}

const localBadges: ProfileBadge = {
    id: "endcord_local_badges",
    position: BadgePosition.END,
    getBadges: ({ userId }) => {
        const profile = activeProfile();
        const currentUser = originalGetCurrentUser?.() ?? UserStore.getCurrentUser();
        if (!profile?.enabled || userId !== currentUser?.id) return [];

        return profile.badges.map(badgeId => {
            const badge = BADGES[badgeId];
            return {
                id: `endcord_${badgeId}`,
                key: `endcord_${badgeId}`,
                description: `${badge.label} (only visible in Endcord)`,
                component: () => (
                    <span
                        aria-label={`${badge.label} (only visible in Endcord)`}
                        className="ec-profile-badge"
                        style={{ color: badge.color }}
                        title={`${badge.label} (only visible in Endcord)`}
                    >
                        {badge.glyph}
                    </span>
                )
            } satisfies ProfileBadge;
        });
    }
};

function Section({ title, description, children }: { title: string; description: string; children?: React.ReactNode; }) {
    return (
        <section className="ec-section">
            <Forms.FormTitle tag="h3">{title}</Forms.FormTitle>
            <Forms.FormText>{description}</Forms.FormText>
            <div className="ec-section-content">{children}</div>
        </section>
    );
}

function ToggleButton({ checked, label, onClick }: { checked: boolean; label: string; onClick: () => void; }) {
    return <Button variant={checked ? "primary" : "secondary"} onClick={onClick}>{checked ? "✓ " : "○ "}{label}</Button>;
}

function Field({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange(value: string): void; }) {
    return (
        <label className="ec-field">
            <span>{label}</span>
            <TextInput value={value} placeholder={placeholder} onChange={onChange} />
        </label>
    );
}

function EndcordControlCenter() {
    settings.use();
    const [tab, setTab] = React.useState<Tab>("home");
    const state = data();
    const profile = activeProfile();
    const tabs: Array<[Tab, string]> = [
        ["home", "Home"], ["profile", "Profile Studio"], ["focus", "Focus Hub"], ["voice", "Voice Scenes"],
        ["spaces", "Server Spaces"], ["templates", "Message Toolkit"], ["privacy", "Privacy"],
    ];

    return (
        <div className="ec-control-center">
            <div className="ec-hero" style={{ borderColor: profile.accent }}>
                <div>
                    <Forms.FormTitle tag="h2">Endcord Control Center</Forms.FormTitle>
                    <Forms.FormText>Everything here is saved locally by Vencord. Profile overrides and badges are rendered only in your Endcord client.</Forms.FormText>
                </div>
                <span className="ec-profile-pill" style={{ backgroundColor: profile.accent }}>{profile.name}</span>
            </div>
            <div className="ec-tabs">
                {tabs.map(([id, label]) => <Button key={id} variant={tab === id ? "primary" : "secondary"} onClick={() => setTab(id)}>{label}</Button>)}
            </div>
            {tab === "home" && <Home state={state} profile={profile} setTab={setTab} />}
            {tab === "profile" && <ProfileStudio state={state} profile={profile} />}
            {tab === "focus" && <FocusHub state={state} />}
            {tab === "voice" && <VoiceScenes state={state} profile={profile} />}
            {tab === "spaces" && <ServerSpaces state={state} />}
            {tab === "templates" && <MessageToolkit state={state} />}
            {tab === "privacy" && <Privacy />}
        </div>
    );
}

function Home({ state, profile, setTab }: { state: EndcordData; profile: LocalProfile; setTab(tab: Tab): void; }) {
    const scene = state.voiceScenes.find(scene => scene.id === profile.voiceSceneId);
    return <>
        <Section title="Your Endcord at a glance" description="A local control layer above Discord. It does not call Discord APIs or transmit custom profile information.">
            <div className="ec-grid">
                <div className="ec-card"><strong>{profile.name}</strong><span>active profile</span></div>
                <div className="ec-card"><strong>{scene?.name ?? "No scene"}</strong><span>voice scene</span></div>
                <div className="ec-card"><strong>{state.focus.enabled ? "On" : "Off"}</strong><span>focus mode</span></div>
                <div className="ec-card"><strong>{state.messageTemplates.length}</strong><span>message templates</span></div>
            </div>
        </Section>
        <Section title="Quick actions" description="Jump straight to the pieces you will use most.">
            <Flex gap="0.5em" style={{ flexWrap: "wrap" }}>
                <Button onClick={() => setTab("profile")}>Edit local profile</Button>
                <Button onClick={() => setTab("focus")}>Configure focus</Button>
                <Button onClick={() => setTab("templates")}>Manage templates</Button>
            </Flex>
        </Section>
    </>;
}

function ProfileStudio({ state, profile }: { state: EndcordData; profile: LocalProfile; }) {
    const updateProfile = (mutator: (profile: LocalProfile) => void) => updateData(next => {
        const target = next.profiles.find(item => item.id === next.activeProfileId);
        if (target) mutator(target);
    });
    const addProfile = () => updateData(next => {
        const newProfile: LocalProfile = {
            ...structuredClone(activeProfile()),
            id: id("profile"),
            name: `Profile ${next.profiles.length + 1}`,
        };
        next.profiles.push(newProfile);
        next.activeProfileId = newProfile.id;
    });

    return <>
        <Section title="Profiles" description="Profiles bundle your local identity, accent, focus preference and selected voice scene. Switching is immediate and never updates your Discord account.">
            <Flex gap="0.5em" style={{ flexWrap: "wrap" }}>
                {state.profiles.map(item => <Button key={item.id} variant={item.id === state.activeProfileId ? "primary" : "secondary"} onClick={() => updateData(next => next.activeProfileId = item.id)}>{item.name}</Button>)}
                <Button variant="secondary" onClick={addProfile}>+ New profile</Button>
            </Flex>
        </Section>
        <Section title="Local profile preview" description="Username, display name and bio are replaced only while Endcord is running. Blank fields retain your real Discord data.">
            <div className="ec-fields">
                <Field label="Profile name" value={profile.name} onChange={value => updateProfile(item => item.name = value)} />
                <Field label="Fake username" value={profile.username} placeholder="Displayed only locally" onChange={value => updateProfile(item => item.username = value)} />
                <Field label="Fake display name" value={profile.displayName} placeholder="Displayed only locally" onChange={value => updateProfile(item => item.displayName = value)} />
                <Field label="Fake bio" value={profile.bio} placeholder="Displayed only locally" onChange={value => updateProfile(item => item.bio = value)} />
                <Field label="Accent colour" value={profile.accent} placeholder="#5865f2" onChange={value => updateProfile(item => item.accent = value)} />
            </div>
            <Flex gap="0.5em" style={{ flexWrap: "wrap" }}>
                <ToggleButton checked={profile.enabled} label="Apply local profile" onClick={() => updateProfile(item => item.enabled = !item.enabled)} />
                <ToggleButton checked={profile.focusMode} label="Enable focus with this profile" onClick={() => updateProfile(item => item.focusMode = !item.focusMode)} />
            </Flex>
        </Section>
        <Section title="Local badges" description="Choose the badges shown beside your own profile in Endcord. They are not Discord badges and nobody else can see them.">
            <Flex gap="0.5em" style={{ flexWrap: "wrap" }}>
                {(Object.keys(BADGES) as BadgeId[]).map(badgeId => {
                    const badge = BADGES[badgeId];
                    const enabled = profile.badges.includes(badgeId);
                    return <Button key={badgeId} variant={enabled ? "primary" : "secondary"} onClick={() => updateProfile(item => {
                        item.badges = enabled ? item.badges.filter(id => id !== badgeId) : [...item.badges, badgeId];
                    })}><span style={{ color: badge.color }}>{badge.glyph}</span> {badge.label}</Button>;
                })}
            </Flex>
        </Section>
    </>;
}

function FocusHub({ state }: { state: EndcordData; }) {
    const { focus } = state;
    return <>
        <Section title="Focus Hub" description="Define which server IDs belong to your focus space. This is local metadata for Endcord and does not change server notification settings.">
            <Flex gap="0.5em" style={{ flexWrap: "wrap" }}>
                <ToggleButton checked={focus.enabled} label="Focus mode" onClick={() => updateData(next => next.focus.enabled = !next.focus.enabled)} />
                <ToggleButton checked={focus.includeMentionsOnly} label="Mentions and DMs first" onClick={() => updateData(next => next.focus.includeMentionsOnly = !next.focus.includeMentionsOnly)} />
            </Flex>
            <div className="ec-fields"><Field label="Focus server IDs" value={focus.guildIds} placeholder="Comma-separated server IDs" onChange={value => updateData(next => next.focus.guildIds = value)} /></div>
        </Section>
        <Section title="How it behaves" description="Focus data is ready for the Endcord home view: keep your selected communities together and put direct mentions first. Your normal Discord channels and notification preferences remain untouched." />
    </>;
}

function VoiceScenes({ state, profile }: { state: EndcordData; profile: LocalProfile; }) {
    const activeScene = state.voiceScenes.find(scene => scene.id === profile.voiceSceneId) ?? state.voiceScenes[0];
    return <>
        <Section title="Voice Scenes" description="Save local audio presets for your different contexts. Endcord never changes device permissions or sends audio settings to Discord without you doing so.">
            <Flex gap="0.5em" style={{ flexWrap: "wrap" }}>
                {state.voiceScenes.map(scene => <Button key={scene.id} variant={scene.id === activeScene?.id ? "primary" : "secondary"} onClick={() => updateData(next => {
                    const target = next.profiles.find(item => item.id === next.activeProfileId);
                    if (target) target.voiceSceneId = scene.id;
                })}>{scene.name}</Button>)}
            </Flex>
        </Section>
        {activeScene && <Section title={`${activeScene.name} scene`} description="These values are retained locally as a scene definition, ready for manual application to Discord's Voice settings.">
            <div className="ec-fields">
                <Field label="Scene name" value={activeScene.name} onChange={value => updateData(next => {
                    const target = next.voiceScenes.find(scene => scene.id === activeScene.id);
                    if (target) target.name = value;
                })} />
                <Field label="Input volume" value={String(activeScene.inputVolume)} onChange={value => updateData(next => {
                    const target = next.voiceScenes.find(scene => scene.id === activeScene.id);
                    if (target) target.inputVolume = Math.max(0, Math.min(200, Number(value) || 0));
                })} />
                <Field label="Output volume" value={String(activeScene.outputVolume)} onChange={value => updateData(next => {
                    const target = next.voiceScenes.find(scene => scene.id === activeScene.id);
                    if (target) target.outputVolume = Math.max(0, Math.min(200, Number(value) || 0));
                })} />
            </div>
            <ToggleButton checked={activeScene.pushToTalk} label="Push to talk" onClick={() => updateData(next => {
                const target = next.voiceScenes.find(scene => scene.id === activeScene.id);
                if (target) target.pushToTalk = !target.pushToTalk;
            })} />
        </Section>}
    </>;
}

function ServerSpaces({ state }: { state: EndcordData; }) {
    const addSpace = () => updateData(next => next.serverSpaces.push({ id: id("space"), guildId: "", name: `Space ${next.serverSpaces.length + 1}`, accent: "#5865f2", muted: false }));
    return <Section title="Server Spaces" description="Label and colour-code selected servers locally. This never renames a Discord server or changes it for other members.">
        {state.serverSpaces.map(space => <div className="ec-row" key={space.id}>
            <div className="ec-fields">
                <Field label="Space name" value={space.name} onChange={value => updateData(next => {
                    const target = next.serverSpaces.find(item => item.id === space.id);
                    if (target) target.name = value;
                })} />
                <Field label="Guild ID" value={space.guildId} placeholder="Discord server ID" onChange={value => updateData(next => {
                    const target = next.serverSpaces.find(item => item.id === space.id);
                    if (target) target.guildId = value;
                })} />
                <Field label="Accent" value={space.accent} onChange={value => updateData(next => {
                    const target = next.serverSpaces.find(item => item.id === space.id);
                    if (target) target.accent = value;
                })} />
            </div>
            <Flex gap="0.5em" style={{ flexWrap: "wrap" }}><ToggleButton checked={space.muted} label="Muted in Endcord" onClick={() => updateData(next => {
                const target = next.serverSpaces.find(item => item.id === space.id);
                if (target) target.muted = !target.muted;
            })} /><Button variant="dangerSecondary" onClick={() => updateData(next => next.serverSpaces = next.serverSpaces.filter(item => item.id !== space.id))}>Remove</Button></Flex>
        </div>)}
        <Button onClick={addSpace}>+ Add server space</Button>
    </Section>;
}

function MessageToolkit({ state }: { state: EndcordData; }) {
    const addTemplate = () => updateData(next => next.messageTemplates.push({ id: id("template"), name: `Template ${next.messageTemplates.length + 1}`, shortcut: "", content: "" }));
    return <Section title="Message Toolkit" description="Keep reusable replies locally. Copy a template with one click, or send ;shortcut to expand it before sending; Endcord does not read or store your message history.">
        {state.messageTemplates.map(template => <div className="ec-row" key={template.id}>
            <div className="ec-fields">
                <Field label="Template name" value={template.name} onChange={value => updateData(next => {
                    const target = next.messageTemplates.find(item => item.id === template.id);
                    if (target) target.name = value;
                })} />
                <Field label="Shortcut" value={template.shortcut} placeholder="brb" onChange={value => updateData(next => {
                    const target = next.messageTemplates.find(item => item.id === template.id);
                    if (target) target.shortcut = value;
                })} />
                <Field label="Message" value={template.content} placeholder="Your reusable answer" onChange={value => updateData(next => {
                    const target = next.messageTemplates.find(item => item.id === template.id);
                    if (target) target.content = value;
                })} />
            </div>
            <Flex gap="0.5em" style={{ flexWrap: "wrap" }}><Button onClick={() => copyWithToast(template.content)}>Copy</Button><Button variant="dangerSecondary" onClick={() => updateData(next => next.messageTemplates = next.messageTemplates.filter(item => item.id !== template.id))}>Remove</Button></Flex>
        </div>)}
        <Button onClick={addTemplate}>+ Add template</Button>
    </Section>;
}

function Privacy() {
    return <>
        <Section title="Local-only guarantee" description="Endcord stores its profiles, fake badges, spaces, scenes and templates in Vencord's local settings. It does not make Discord profile API requests and it cannot change what anyone else sees." />
        <Section title="Remove Endcord data" description="This resets all Endcord profiles, badges, scenes, server spaces and message templates on this device.">
            <Button variant="dangerPrimary" onClick={() => {
                settings.store.data = createDefaultData();
                applyActiveProfile();
                notify("Endcord data reset on this device.");
            }}>Reset local Endcord data</Button>
        </Section>
    </>;
}

export default definePlugin({
    name: "Endcord",
    description: "A local Endcord control center with profile overlays, badges, presets, focus spaces and message templates",
    tags: ["Appearance", "Customisation", "Utility"],
    authors: [],
    settings,
    start() {
        data();
        addProfileBadge(localBadges);
        installLocalProfileOverlay();
    },
    stop() {
        removeProfileBadge(localBadges);
        uninstallLocalProfileOverlay();
    },
    onBeforeMessageSend(_, message) {
        const shortcut = message.content.trim();
        const template = data().messageTemplates.find(item => item.shortcut.trim() && shortcut === `;${item.shortcut.trim()}`);
        if (template) message.content = template.content;
    }
});
