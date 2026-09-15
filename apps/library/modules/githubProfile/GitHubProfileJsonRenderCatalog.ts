import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

const contributionDaySchema = z.object({
  date: z.string(),
  count: z.number().int(),
  level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)])});

export const githubProfileJsonRenderCatalog = defineCatalog(schema, {
  components: {
    ProfileCard: {
      props: z.object({}),
      slots: ["default"],
      description: "Slotted shell for composing a GitHub profile layout."},
    Avatar: {
      props: z.object({
        avatar_url: z.string(),
        login: z.string()}),
      description: "User avatar image with initials fallback."},
    Identity: {
      props: z.object({
        name: z.string().nullable(),
        login: z.string()}),
      description: "Display name and @login."},
    Bio: {
      props: z.object({
        bio: z.string().nullable()}),
      description: "Profile bio text."},
    MetaRow: {
      props: z.object({
        location: z.string().nullable(),
        blog: z.string()}),
      description: "Location and blog/link row."},
    StatsRow: {
      props: z.object({
        public_repos: z.number().int(),
        followers: z.number().int(),
        following: z.number().int()}),
      description: "Repository, follower, and following counts."},
    ActivityHeatmap: {
      props: z.object({
        contributions: z.array(contributionDaySchema)}),
      description: "Contribution activity calendar heatmap."}},
  actions: {}});
