from xhome.actuator import Lamp
import time

lamp = Lamp()
places = ["entrance","livingroom","kitchen","room","bathroom"]

for p in places:
    print("\n===", p, "===")
    lamp.on(p)
    for i in range(4):
        time.sleep(0.5)
        print("ON state:", lamp.state)
    lamp.off(p)
    for i in range(4):
        time.sleep(0.5)
        print("OFF state:", lamp.state)
