import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  // loader 会自动扫描指定目录下的所有 md 文件
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    pubDate: z.date().or(z.string()),
    description: z.string().optional(),
  }),
});

export const collections = { blog };