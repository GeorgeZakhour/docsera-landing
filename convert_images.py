import os
from PIL import Image

# Source and Dest
uploaded_dir = "/Users/georgezakhour/.gemini/antigravity/brain/03f4a1ee-eb82-41d1-8349-9a2340d3a98f"
public_dir = "/Users/georgezakhour/development/docsera-landing/public/images/screenshots"

# Mapping for uploaded files (if any need specific naming)
# We already copied booking files. We need to copy messaging files.
# Let's just process the public directory for existing pngs AND the uploaded dir for new ones.

files_to_convert = [
    # Booking (Already in public as png, convert to webp)
    {"src": f"{public_dir}/booking_1.png", "dest": f"{public_dir}/booking_1.webp"},
    {"src": f"{public_dir}/booking_2.png", "dest": f"{public_dir}/booking_2.webp"},
    {"src": f"{public_dir}/booking_3.png", "dest": f"{public_dir}/booking_3.webp"},
    {"src": f"{public_dir}/booking_4.png", "dest": f"{public_dir}/booking_4.webp"},
    {"src": f"{public_dir}/booking_5.png", "dest": f"{public_dir}/booking_5.webp"},
    
    # Messaging (In uploaded dir, convert to webp in public)
    {"src": f"{uploaded_dir}/uploaded_image_0_1767930400038.png", "dest": f"{public_dir}/messages_list.webp"},
    {"src": f"{uploaded_dir}/uploaded_image_1_1767930400038.png", "dest": f"{public_dir}/conversation.webp"},

    # Existing PNGs to cleanup/optimize
    {"src": f"{public_dir}/search_specialty.png", "dest": f"{public_dir}/search_specialty.webp"},
    {"src": f"{public_dir}/search_location.png", "dest": f"{public_dir}/search_location.webp"},
    {"src": f"{public_dir}/doctor_qr.png", "dest": f"{public_dir}/doctor_qr.webp"},
    {"src": f"{public_dir}/doctor_profile_full.png", "dest": f"{public_dir}/doctor_profile_full.webp"},
    {"src": f"{public_dir}/appointments_list.png", "dest": f"{public_dir}/appointments_list.webp"},
    {"src": f"{public_dir}/appointment_details.png", "dest": f"{public_dir}/appointment_details.webp"},
]

for item in files_to_convert:
    try:
        if os.path.exists(item["src"]):
            img = Image.open(item["src"])
            img.save(item["dest"], format="webp", quality=90)
            print(f"Converted {item['src']} to {item['dest']}")
            # Optional: remove user uploaded ones? No, keep safe.
            # remove public pngs? Maybe after verification.
        else:
            print(f"File not found: {item['src']}")
    except Exception as e:
        print(f"Error converting {item['src']}: {e}")
