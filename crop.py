from PIL import Image

# Open the screenshot
img = Image.open('flame-mascot.png')

# The Ideogram generated image is usually in the center.
# The screenshot is 1024x665. 
# A square in the center would be bounded by x: (1024-H)/2, y: 0 to H
w, h = img.size
# Let's crop a 500x500 square from the middle, slightly adjusted for the UI at the bottom.
size = 500
left = (w - size) / 2
top = (h - size) / 2 - 20 # shift up slightly to avoid bottom UI

cropped = img.crop((left, top, left + size, top + size))
cropped.save('flame-mascot-cropped.png')
print("Cropped successfully")
