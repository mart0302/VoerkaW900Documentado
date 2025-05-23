# 证书

## 证书监听器

http://192.168.38.165:9000/voerka/voerkalicensewatcher



## 编译问题

证书监听器代码编译完后，放到electron里面执行，会报错；

https://github.com/bytenode/bytenode/issues/63

**原因**：

`electron内部的nodejs环境`与`外部编译的nodejs环境`不匹配导致

**解决方案**：

将原本外部编译的过程也放到electron主进程中编译

**目前如何编译**:

1. 将环境变量的`LICENSE_BUILD`设置`true`，启动项目，等待日志输出提示，关闭项目运行；

2. 再将`LICENSE_BUILD`改回`false`；

P.S. 编译只需执行一次，如果你没有修改升级证书监听器的代码，没必要编译，只管用就行了

**升级证书监听器**：

拉取代码，将`src.js`替换`src-electron/license/build/src.js`即可，然后`使用electron重新编译`即可

