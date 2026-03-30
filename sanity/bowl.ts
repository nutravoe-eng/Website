export const bowl = {
  name: "bowl",
  title: "Bowl",
  type: "document",
  fields: [
    {
      name: "name",
      title: "Name",
      type: "string",
      validation: (Rule: any) => Rule.required(),
    },
    {
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "name", maxLength: 96 },
      validation: (Rule: any) => Rule.required(),
    },
    {
      name: "tagline",
      title: "Tagline",
      type: "string",
      description: "One evocative line",
    },
    {
      name: "description",
      title: "Description",
      type: "text",
      rows: 3,
    },
    {
      name: "price",
      title: "Price (INR)",
      type: "number",
      validation: (Rule: any) => Rule.required().min(0),
    },
    {
      name: "image",
      title: "Image",
      type: "image",
      options: { hotspot: true },
    },
    {
      name: "tags",
      title: "Tags",
      type: "array",
      of: [{ type: "string" }],
      options: {
        list: [
          { title: "Bestseller", value: "bestseller" },
          { title: "High Protein", value: "high-protein" },
          { title: "Seasonal", value: "seasonal" },
          { title: "Vegan Friendly", value: "vegan-friendly" },
        ],
      },
    },
    {
      name: "available",
      title: "Available",
      type: "boolean",
      initialValue: true,
    },
    {
      name: "displayOrder",
      title: "Display Order",
      type: "number",
    },
  ],
};
