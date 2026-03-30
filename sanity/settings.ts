export const settings = {
  name: "settings",
  title: "Global Settings",
  type: "document",
  fields: [
    {
      name: "whatsappNumber",
      title: "WhatsApp Number (with country code, no +)",
      type: "string",
      description: "e.g. 917899858374",
    },
    {
      name: "swiggyUrl",
      title: "Swiggy URL",
      type: "url",
    },
    {
      name: "zomatoUrl",
      title: "Zomato URL",
      type: "url",
    },
    {
      name: "instagramUrl",
      title: "Instagram URL",
      type: "url",
    },
  ],
};
