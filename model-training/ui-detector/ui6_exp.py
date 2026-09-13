from yolox.exp import Exp as YOLOXExp


class Exp(YOLOXExp):
    def __init__(self):
        super().__init__()
        self.num_classes = 6
        self.depth = 0.33
        self.width = 0.25
        self.input_size = (416, 416)
        self.test_size = (416, 416)
        self.random_size = (10, 20)
        self.data_dir = "/kaggle/input/privsight-ui-six-class"
        self.train_ann = "instances_train.json"
        self.val_ann = "instances_val.json"
        self.max_epoch = 30
        self.warmup_epochs = 1
        self.no_aug_epochs = 5
        self.eval_interval = 1
        self.output_dir = "/kaggle/working/YOLOX_outputs"
        self.exp_name = "ui6_nano"
