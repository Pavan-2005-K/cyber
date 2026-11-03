
def extract_profile_features(profile: dict) -> dict:
    """Convert profile details into the 11 model input features."""

    username = str(profile.get("username", "")).strip()
    fullname = str(profile.get("fullname", "")).strip()
    description = str(profile.get("description", "")).strip()
    external_url = str(profile.get("external_url", "")).strip()

    # 1. Profile picture exists
    profile_pic = int(bool(profile.get("has_profile_picture", False)))

    # 2. Ratio of digits to username length
    username_length = len(username)
    username_digit_ratio = (
        sum(char.isdigit() for char in username) / username_length
        if username_length > 0
        else 0.0
    )

    # 3. Number of words in the full name
    fullname_words = len(fullname.split())

    # 4. Ratio of digits to full-name length
    fullname_length = len(fullname)
    fullname_digit_ratio = (
        sum(char.isdigit() for char in fullname) / fullname_length
        if fullname_length > 0
        else 0.0
    )

    # 5. Whether the full name matches the username
    name_matches_username = int(
        bool(fullname and username)
        and fullname.casefold() == username.casefold()
    )

    # 6. Description length
    description_length = len(description)

    # 7. Whether an external URL is provided
    has_external_url = int(bool(external_url))

    # 8. Whether the profile is private
    is_private = int(bool(profile.get("is_private", False)))

    # 9–11. Profile activity and audience counts
    posts = max(0, int(profile.get("posts", 0)))
    followers = max(0, int(profile.get("followers", 0)))
    following = max(0, int(profile.get("following", 0)))

    # Return features using the exact model feature names
    return {
        "profile pic": profile_pic,
        "nums/length username": username_digit_ratio,
        "fullname words": fullname_words,
        "nums/length fullname": fullname_digit_ratio,
        "name==username": name_matches_username,
        "description length": description_length,
        "external URL": has_external_url,
        "private": is_private,
        "#posts": posts,
        "#followers": followers,
        "#follows": following,
    }
