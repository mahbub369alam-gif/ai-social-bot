import axios from "axios";

export type UserProfile = {
  name?: string;
  profilePic?: string;
  username?: string;
};

/**
 * Facebook Messenger User Profile API (PSID -> name, profile_pic)
 * Needs a VALID Page Access Token with messaging permissions for that Page.
 */
export const fetchFacebookUserProfile = async (
  psid: string,
  pageAccessToken: string
): Promise<UserProfile | null> => {
  try {
    if (!psid || !pageAccessToken) return null;

    const url = `https://graph.facebook.com/v18.0/${encodeURIComponent(psid)}`;
    const { data } = await axios.get(url, {
      params: {
        fields: "name,first_name,last_name,profile_pic",
        access_token: pageAccessToken,
      },
      timeout: 12000,
    });

    const fullName =
      data?.name ||
      `${data?.first_name || ""} ${data?.last_name || ""}`.trim() ||
      undefined;

    return {
      name: fullName,
      profilePic: data?.profile_pic || undefined,
    };
  } catch (e: any) {
    // Helpful debug (optional)
    // console.log("fetchFacebookUserProfile failed:", e?.response?.data || e?.message);
    return null;
  }
};

/**
 * Instagram User Profile API (instagram-scoped-id -> name, profile_pic)
 * IMPORTANT:
 * - Works with Instagram User access token (NOT page token).
 * - Endpoint is graph.instagram.com (different from graph.facebook.com).
 */
export const fetchInstagramUserProfile = async (
  igScopedId: string,
  igUserAccessToken: string
): Promise<UserProfile | null> => {
  try {
    if (!igScopedId || !igUserAccessToken) return null;

    const url = `https://graph.instagram.com/v18.0/${encodeURIComponent(igScopedId)}`;
    const { data } = await axios.get(url, {
      params: {
        fields: "name,profile_pic,username",
        access_token: igUserAccessToken,
      },
      timeout: 12000,
    });

    return {
      name: data?.name || data?.username || undefined,
      username: data?.username || undefined,
      profilePic: data?.profile_pic || undefined,
    };
  } catch (e: any) {
    // console.log("fetchInstagramUserProfile failed:", e?.response?.data || e?.message);
    return null;
  }
};





























// import axios from "axios";

// const FB_GRAPH_VERSION = "v18.0";

// /**
//  * Facebook profile (PSID):
//  * GET /{PSID}?fields=name,profile_pic
//  * 3rd arg kept optional for backward-compat (some controllers pass pageId)
//  */
// export async function fetchFacebookUserProfile(
//   psid: string,
//   pageAccessToken: string,
//   _pageId?: string
// ): Promise<{ name?: string; profilePic?: string } | null> {
//   try {
//     const url = `https://graph.facebook.com/${FB_GRAPH_VERSION}/${psid}`;

//     const res = await axios.get(url, {
//       params: {
//         fields: "name,profile_pic",
//         access_token: pageAccessToken,
//       },
//     });

//     return {
//       name: res.data?.name,
//       profilePic: res.data?.profile_pic,
//     };
//   } catch (err: unknown) {
//     if (axios.isAxiosError(err)) {
//       console.error("Facebook profile fetch failed:", err.response?.data || err.message);
//     } else {
//       console.error("Facebook profile fetch failed:", err);
//     }
//     return null;
//   }
// }

// /**
//  * Instagram profile:
//  * GET /{IG_USER_ID}?fields=username,profile_picture_url
//  * 3rd arg kept optional for backward-compat
//  */
// export async function fetchInstagramUserProfile(
//   igUserId: string,
//   pageAccessToken: string,
//   _pageId?: string
// ): Promise<{ name?: string; profilePic?: string } | null> {
//   try {
//     const url = `https://graph.facebook.com/${FB_GRAPH_VERSION}/${igUserId}`;

//     const res = await axios.get(url, {
//       params: {
//         fields: "username,profile_picture_url",
//         access_token: pageAccessToken,
//       },
//     });

//     return {
//       name: res.data?.username,
//       profilePic: res.data?.profile_picture_url,
//     };
//   } catch (err: unknown) {
//     if (axios.isAxiosError(err)) {
//       console.error("Instagram profile fetch failed:", err.response?.data || err.message);
//     } else {
//       console.error("Instagram profile fetch failed:", err);
//     }
//     return null;
//   }
// }

// // Backward compatible names (controller may call get*)
// export const getFacebookUserProfile = fetchFacebookUserProfile;
// export const getInstagramUserProfile = fetchInstagramUserProfile;
