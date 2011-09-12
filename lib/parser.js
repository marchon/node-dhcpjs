// Copyright 2011 Andrew Paprocki. All rights reserved.

var assert = require('assert');
var protocol = require('./protocol');

module.exports.parse = function(msg, rinfo) {
    function trimNulls(str) {
        var idx = str.indexOf('\u0000');
        return (-1 === idx) ? str : str.substr(0, idx);
    }
    function readIpRaw(msg, offset) {
        if (0 === msg.readUInt8(offset))
            return undefined;
        return '' +
            msg.readUInt8(offset++) + '.' +
            msg.readUInt8(offset++) + '.' +
            msg.readUInt8(offset++) + '.' +
            msg.readUInt8(offset++);
    }
    function readIp(msg, offset, obj, name) {
        var len = msg.readUInt8(offset++);
        assert.strictEqual(len, 4);
        p.options[name] = readIpRaw(msg, offset);
        return offset + len;
    }
    function readString(msg, offset, obj, name) {
        var len = msg.readUInt8(offset++);
        p.options[name] = msg.toString('ascii', offset, offset + len);
        offset += len;
        return offset;
    }
    function readAddressRaw(msg, offset, len) {
        var addr = '';
        while (len-- > 0) {
            var b = msg.readUInt8(offset++);
            addr += (b + 0x100).toString(16).substr(-2);
            if (len > 0) {
                addr += ':';
            }
        }
        return addr;
    }
    //console.log(rinfo.address + ':' + rinfo.port + '/' + msg.length + 'b');
    var p = {
        op: protocol.BOOTPMessageType.get(msg.readUInt8(0)),
        // htype is combined into chaddr field object
        hlen: msg.readUInt8(2),
        hops: msg.readUInt8(3),
        xid: msg.readUInt32BE(4),
        secs: msg.readUInt16BE(8),
        flags: msg.readUInt16BE(10),
        ciaddr: readIpRaw(msg, 12),
        yiaddr: readIpRaw(msg, 16),
        siaddr: readIpRaw(msg, 20),
        giaddr: readIpRaw(msg, 24),
        chaddr: protocol.createHardwareAddress(
                    protocol.ARPHardwareType.get(msg.readUInt8(1)),
                    readAddressRaw(msg, 28, msg.readUInt8(2))),
        sname: trimNulls(msg.toString('ascii', 44, 108)),
        file: trimNulls(msg.toString('ascii', 108, 236)),
        magic: msg.readUInt32BE(236),
        options: {}
    };
    var offset = 240;
    var code = 0;
    while (code != 255 && offset < msg.length) {
        code = msg.readUInt8(offset++);
        switch (code) {
            case 0: continue;   // pad
            case 255: break;    // end
            case 1: {           // subnetMask
                offset = readIp(msg, offset, p, 'subnetMask');
                break;
            }
            case 2: {           // timeOffset
                var len = msg.readUInt8(offset++);
                assert.strictEqual(len, 4);
                p.options.timeOffset = msg.readUInt32BE(offset);
                offset += len;
                break;
            }
            case 3: {           // routerOption
                var len = msg.readUInt8(offset++);
                assert.strictEqual(len % 4, 0);
                p.options.routerOption = [];
                while (len > 0) {
                    p.options.routerOption.push(readIpRaw(msg, offset));
                    offset += 4;
                    len -= 4;
                }
                break;
            }
            case 6: {           // domainNameServerOption
                var len = msg.readUInt8(offset++);
                assert.strictEqual(len % 4, 0);
                p.options.domainNameServerOption = [];
                while (len > 0) {
                    p.options.domainNameServerOption.push(
                        readIpRaw(msg, offset));
                    offset += 4;
                    len -= 4;
                }
                break;
            }
            case 12: {          // hostName
                offset = readString(msg, offset, p, 'hostName');
                break;
            }
            case 15: {          // domainName
                offset = readString(msg, offset, p, 'domainName');
                break;
            }
            case 43: {          // vendorOptions
                var len = msg.readUInt8(offset++);
                p.options.vendorOptions = {};
                while (len > 0) {
                    var vendop = msg.readUInt8(offset++);
                    var vendoplen = msg.readUInt8(offset++);
                    var buf = new Buffer(vendoplen);
                    msg.copy(buf, 0, offset, offset + vendoplen);
                    p.options.vendorOptions[vendop] = buf;
                    len -= 2 + vendoplen;
                }
                break;
            }
            case 50: {          // requestedIpAddress
                offset = readIp(msg, offset, p, 'requestedIpAddress');
                break;
            }
            case 51: {          // ipAddressLeaseTime
                var len = msg.readUInt8(offset++);
                assert.strictEqual(len, 4);
                p.options.ipAddressLeaseTime =
                    msg.readUInt32BE(offset);
                offset += 4;
                break;
            }
            case 52: {          // optionOverload
                var len = msg.readUInt8(offset++);
                assert.strictEqual(len, 1);
                p.options.optionOverload = msg.readUInt8(offset++);
                break;
            }
            case 53: {          // dhcpMessageType
                var len = msg.readUInt8(offset++);
                assert.strictEqual(len, 1);
                var mtype = msg.readUInt8(offset++);
                assert.ok(1 <= mtype);
                assert.ok(8 >= mtype);
                p.options.dhcpMessageType = protocol.DHCPMessageType.get(mtype);
                break;
            }
            case 54: {          // serverIdentifier
                offset = readIp(msg, offset, p, 'serverIdentifier');
                break;
            }
            case 55: {          // parameterRequestList
                var len = msg.readUInt8(offset++);
                p.options.parameterRequestList = [];
                while (len-- > 0) {
                    var option = msg.readUInt8(offset++);
                    p.options.parameterRequestList.push(option);
                }
                break;
            }
            case 57: {          // maximumMessageSize
                var len = msg.readUInt8(offset++);
                assert.strictEqual(len, 2);
                p.options.maximumMessageSize =
                    msg.readUInt16BE(offset);
                offset += len;
                break;
            }
            case 60: {          // vendorClassIdentifier
                offset = readString(msg, offset, p,
                                    'vendorClassIdentifier');
                                    break;
            }
            case 61: {          // clientIdentifier
                var len = msg.readUInt8(offset++);
                p.options.clientIdentifier =
                    protocol.createHardwareAddress(
                        protocol.ARPHardwareType.get(msg.readUInt8(offset)),
                        readAddressRaw(msg, offset + 1, len - 1));
                offset += len;
                break;
            }
            case 81: {          // fullyQualifiedDomainName
                var len = msg.readUInt8(offset++);
                p.options.fullyQualifiedDomainName = {
                    flags: msg.readUInt8(offset),
                    name: msg.toString('ascii', offset + 3, offset + len)
                };
                offset += len;
                break;
            }
            default: {
                var len = msg.readUInt8(offset++);
                console.log('Unhandled DHCP option ' + code + '/' + len + 'b');
                offset += len;
                break;
            }
        }
    }
    this.emit('message', p);
};